'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Trash2, X, TrendingUp, Target, ArrowRight, Search, ChevronDown, Globe, FileUp } from 'lucide-react'
import Button from '@/components/ui/Button'
import { ColumnHint } from '@/components/ui/ColumnHint'
import type { AhrefsKeywordRow, AhrefsDataset, AhrefsDatasetType } from '@/lib/ahrefsCsvParser'
import {
  analyzeKeywords,
  analyzeOrganicKeywords,
  detectTrends,
  getCategories,
  type ScoredKeyword,
  type TrendKeyword,
  type PriorityLevel,
} from '@/lib/ahrefsAnalyzer'
import { getAllArticles } from '@/lib/articleStorage'
import {
  buildKeywordWpEntriesByKeyword,
  keywordActionButtonLabel,
  normalizeKeywordForArticleMatch,
  type KeywordWpEntry,
} from '@/lib/keywordPublishIndex'
import { generateAutoPrompt } from '@/lib/ahrefsAutoPrompt'

type SortKey = 'priority' | 'score' | 'volume' | 'kd' | 'cpc' | 'keyword' | 'position' | 'trafficChange'
type Tab = 'opportunities' | 'trends' | 'organic'

function PriorityBadge({ level }: { level: PriorityLevel }) {
  if (level === 3) return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white">★★★</span>
  if (level === 2) return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500 text-white">★★</span>
  if (level === 1) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">★</span>
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs text-gray-300">−</span>
}

/** Ahrefs の各指標の説明（ホバーでボックス表示） */
const AHREFS_COLUMN_HINTS = {
  keyword: 'Ahrefsが分析対象とする検索クエリ（Keywords Explorer / Site Explorer）。',
  volume: '対象国の月間検索回数の推定（平均）。Keywords Explorer / Site Explorer の指標。',
  kd: 'そのキーワードで上位10件に入る難しさの目安（0〜100）。上位ページの被リンク等に基づく Ahrefs の推定。',
  cpc: '有料検索におけるクリック単価の目安（データの通貨に依存）。',
  priorityKeywords:
    '狙い目KW＝ボリューム・KD・スコア・トレンドから算出／競合KW＝順位・流入変動・ボリューム中心（KD は使わない）。',
  priorityOrganic:
    '狙い目KW＝ボリューム・KD・スコア・トレンドから算出／競合KW＝順位・流入変動・ボリューム中心（KD は使わない）。',
  scoreKeywords:
    '狙い目KW＝新規獲得向け機会スコア／競合KW＝順位・流入変動・ボリュームから算出する施策スコア（アプリ内）。',
  scoreOrganic:
    '狙い目KW＝新規獲得向け機会スコア／競合KW＝順位・流入変動・ボリュームから算出する施策スコア（アプリ内）。',
  position: 'オーガニック検索での現在の順位（Site Explorer）。',
  trafficChange: '推定オーガニックトラフィックの前回比の変化。',
  category: 'テーマ分類（Ahrefsのカテゴリ列、またはアプリのルールベース分類）。',
  postedDate: 'このKWで保存済み記事がWordPressに公開・予約されている場合の日付。自動投稿（火・金 10:00 cron）はこのテーブルを優先度・スコア順に先頭から消化します。',
  action: '記事作成画面へ。保存済み記事とKWが一致する場合は公開日などを表示。',
  trendPrevVol: '前回インポートしたKW調査CSVにおける月間検索ボリューム（Volume）。',
  trendCurrVol: '最新のKW調査CSVにおける月間検索ボリューム（Volume）。',
  trendChangeRate: '前回Volに対する今回Volの変化率（％）。本一覧は+20%超の上昇のみ表示。',
  trendStatus: 'NEW＝前回CSVに無かったキーワード。上昇＝前回比で検索ボリュームが大きく増えたキーワード。',
} as const

export default function AhrefsPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [datasets, setDatasets] = useState<(Omit<AhrefsDataset, 'keywords'> & { type: AhrefsDatasetType })[]>([])
  const [kwData, setKwData] = useState<AhrefsKeywordRow[]>([])
  const [organicData, setOrganicData] = useState<AhrefsKeywordRow[]>([])
  const [prevKwData, setPrevKwData] = useState<AhrefsKeywordRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const [tab, setTab] = useState<Tab>('opportunities')
  const [sortKey, setSortKey] = useState<SortKey>('priority')
  const [sortAsc, setSortAsc] = useState(false)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterPriority, setFilterPriority] = useState<'all' | PriorityLevel>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showCount, setShowCount] = useState(50)
  const [kwWpEntriesByNorm, setKwWpEntriesByNorm] = useState<Map<string, KeywordWpEntry[]>>(() => new Map())

  const refreshArticleKeywordIndex = useCallback(async () => {
    try {
      const articles = await getAllArticles()
      setKwWpEntriesByNorm(buildKeywordWpEntriesByKeyword(articles))
    } catch {
      setKwWpEntriesByNorm(new Map())
    }
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ahrefs')
      if (!res.ok) throw new Error('データの取得に失敗しました')
      const data = await res.json()

      const dsMeta: (Omit<AhrefsDataset, 'keywords'> & { type: AhrefsDatasetType })[] = []
      const full: AhrefsDataset[] = data.full ?? []

      for (const ds of full) {
        dsMeta.push({ id: ds.id, uploadedAt: ds.uploadedAt, fileName: ds.fileName, rowCount: ds.rowCount, type: ds.type ?? 'keywords' })
      }
      dsMeta.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
      setDatasets(dsMeta)

      const kwSets = full.filter((d: AhrefsDataset) => (d.type ?? 'keywords') === 'keywords')
      const orgSets = full.filter((d: AhrefsDataset) => d.type === 'organic')

      setKwData(kwSets[0]?.keywords ?? [])
      setPrevKwData(kwSets[1]?.keywords ?? [])
      setOrganicData(orgSets[0]?.keywords ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    refreshArticleKeywordIndex()
    const onVis = () => {
      if (document.visibilityState === 'visible') refreshArticleKeywordIndex()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [refreshArticleKeywordIndex])

  useEffect(() => {
    setShowCount(50)
    setFilterPriority('all')
    setFilterCategory('all')
  }, [tab])

  const handleUpload = useCallback(async (fileList: FileList | null) => {
    const file = fileList?.[0]
    if (!file || uploading) return
    if (!file.name.endsWith('.csv')) {
      setError('CSVファイルを選択してください')
      return
    }
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/ahrefs', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'アップロードに失敗しました')
      await fetchData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'アップロードに失敗しました')
    } finally {
      setUploading(false)
    }
  }, [uploading, fetchData])

  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch('/api/ahrefs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('削除に失敗しました')
      await fetchData()
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました')
    }
    setDeleteTarget(null)
  }, [fetchData])

  const scored = useMemo(() => analyzeKeywords(kwData), [kwData])
  const scoredOrganic = useMemo(() => analyzeOrganicKeywords(organicData, true), [organicData])
  const trends = useMemo(() => detectTrends(kwData, prevKwData), [kwData, prevKwData])

  const activeData = tab === 'organic' ? scoredOrganic : scored

  const categories = useMemo(() => getCategories(activeData), [activeData])

  const p3Count = useMemo(() => activeData.filter(k => k.priority === 3).length, [activeData])
  const p2Count = useMemo(() => activeData.filter(k => k.priority === 2).length, [activeData])

  const filtered = useMemo(() => {
    let list = activeData
    if (filterPriority !== 'all') {
      list = list.filter(k => k.priority === filterPriority)
    }
    if (filterCategory !== 'all') {
      list = list.filter(k => k.assignedCategory === filterCategory)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(k => k.keyword.toLowerCase().includes(q))
    }
    const key = sortKey as keyof ScoredKeyword
    list = [...list].sort((a, b) => {
      const aVal = a[key] ?? 0
      const bVal = b[key] ?? 0
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
    })
    return list
  }, [activeData, filterPriority, filterCategory, searchQuery, sortKey, sortAsc])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(false) }
  }

  const handleCreateArticle = useCallback((kw: ScoredKeyword) => {
    const autoPrompt = generateAutoPrompt(kw)
    const params = new URLSearchParams({
      targetKeyword: kw.keyword,
      prompt: autoPrompt,
      fromAhrefs: 'true',
    })
    router.push(`/editor?${params.toString()}`)
  }, [router])

  const SortIcon = ({ field }: { field: SortKey }) => {
    if (sortKey !== field) return <ChevronDown size={12} className="opacity-30" />
    return <ChevronDown size={12} className={`transition-transform ${sortAsc ? 'rotate-180' : ''}`} />
  }

  const hasOrganic = organicData.length > 0
  const hasKw = kwData.length > 0
  const hasData = hasKw || hasOrganic

  const isOrganicTab = tab === 'organic'

  function kdColor(kd: number): string {
    if (kd <= 30) return 'text-green-600'
    if (kd <= 60) return 'text-yellow-600'
    return 'text-red-500'
  }

  const scoreStrong = isOrganicTab ? 55 : 50
  const scoreWeak = isOrganicTab ? 32 : 30

  return (
    <div
      className="w-full py-8 max-w-6xl mx-auto"
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files) }}
    >
      {dragOver && (
        <div className="fixed inset-0 bg-[#33B5E5]/10 border-2 border-dashed border-[#33B5E5] rounded-xl z-50 pointer-events-none flex items-center justify-center">
          <p className="text-[#33B5E5] font-semibold text-lg">CSVをドロップしてインポート</p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A2E] mb-1">KW分析ダッシュボード</h1>
          <p className="text-sm text-[#64748B]">
            AhrefsのCSVデータから狙い目キーワードを分析し、記事制作につなげます。
          </p>
        </div>
        <div>
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={e => { handleUpload(e.target.files); e.target.value = '' }} disabled={uploading} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-[#33B5E5] text-white hover:bg-[#2AA3D0] disabled:opacity-50 transition-colors"
          >
            <FileUp size={16} />
            {uploading ? 'アップロード中...' : 'CSVインポート'}
          </button>
        </div>
      </div>

      {/* Drop Zone (compact) */}
      {!hasData && !loading && (
        <div className="rounded-xl border-2 border-dashed border-[#E2E8F0] bg-white p-8 text-center mb-6">
          <Upload className="mx-auto text-[#94A3B8]" size={32} />
          <p className="mt-2 text-sm font-medium text-[#1A1A2E]">AhrefsのCSVをドラッグ＆ドロップ、またはCSVインポートボタンをクリック</p>
          <p className="mt-1 text-xs text-[#64748B]">Keywords Explorer / Site Explorer (Organic Keywords) のCSV対応</p>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-600 hover:text-red-800"><X size={14} /></button>
        </div>
      )}

      {/* Dataset History */}
      {datasets.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {datasets.map(ds => (
            <div key={ds.id} className="inline-flex items-center gap-2 bg-white border border-[#E2E8F0] rounded-lg px-3 py-1.5 text-xs">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                ds.type === 'organic' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {ds.type === 'organic' ? '競合' : 'KW'}
              </span>
              <span className="font-medium text-[#1A1A2E] max-w-[200px] truncate">{ds.fileName}</span>
              <span className="text-[#64748B]">{ds.rowCount.toLocaleString()}件</span>
              <span className="text-[#94A3B8]">{new Date(ds.uploadedAt).toLocaleDateString('ja-JP')}</span>
              <button onClick={() => setDeleteTarget(ds.id)} className="text-[#94A3B8] hover:text-red-500 transition-colors">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center text-[#64748B]">読み込み中...</div>
      ) : hasData && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
              <p className="text-xs text-[#64748B] mb-1">KW総数</p>
              <p className="text-2xl font-bold text-[#1A1A2E]">{activeData.length.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
              <p className="text-xs text-[#64748B] mb-1">★★★ 即攻め</p>
              <p className="text-2xl font-bold text-amber-600">{p3Count}</p>
            </div>
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
              <p className="text-xs text-[#64748B] mb-1">★★ 有望</p>
              <p className="text-2xl font-bold text-blue-600">{p2Count}</p>
            </div>
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
              <p className="text-xs text-[#64748B] mb-1">トレンドKW</p>
              <p className="text-2xl font-bold text-orange-500">{trends.length}</p>
            </div>
          </div>

          {/* Priority Filters */}
          <div className="flex flex-wrap gap-2 mb-3">
            {([
              { key: 'all' as const, label: 'すべて', count: activeData.length },
              { key: 3 as PriorityLevel, label: '★★★ 即攻め', count: p3Count },
              { key: 2 as PriorityLevel, label: '★★ 有望', count: p2Count },
              { key: 1 as PriorityLevel, label: '★ 余力', count: activeData.filter(k => k.priority === 1).length },
              { key: 0 as PriorityLevel, label: '対象外', count: activeData.filter(k => k.priority === 0).length },
            ]).map(p => (
              <button
                key={String(p.key)}
                onClick={() => setFilterPriority(p.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filterPriority === p.key
                    ? p.key === 3 ? 'bg-amber-500 text-white' : p.key === 2 ? 'bg-blue-500 text-white' : 'bg-[#33B5E5] text-white'
                    : 'bg-white border border-[#E2E8F0] text-[#64748B] hover:border-[#33B5E5]'
                }`}
              >
                {p.label} ({p.count})
              </button>
            ))}
          </div>

          {/* Category Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setFilterCategory('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filterCategory === 'all' ? 'bg-[#33B5E5] text-white' : 'bg-white border border-[#E2E8F0] text-[#64748B] hover:border-[#33B5E5]'
              }`}
            >
              すべて ({activeData.length})
            </button>
            {categories.map(c => (
              <button
                key={c.category}
                onClick={() => setFilterCategory(c.category)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filterCategory === c.category ? 'bg-[#33B5E5] text-white' : 'bg-white border border-[#E2E8F0] text-[#64748B] hover:border-[#33B5E5]'
                }`}
              >
                {c.category} ({c.count})
              </button>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-6 mb-4 border-b border-[#E2E8F0]">
            {([
              { key: 'opportunities' as Tab, label: '狙い目KW', show: hasKw },
              { key: 'organic' as Tab, label: '競合KW', show: hasOrganic },
              { key: 'trends' as Tab, label: 'トレンド', show: hasKw },
            ]).filter(t => t.show).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`pb-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  tab === t.key
                    ? 'border-[#009AE0] text-[#009AE0]'
                    : 'border-transparent text-[#64748B] hover:text-[#1A1A2E]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <input
              type="text"
              placeholder="キーワードを検索..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[#E2E8F0] bg-white text-sm focus:ring-2 focus:ring-[#33B5E5]/30 focus:border-[#33B5E5] outline-none"
            />
          </div>

          {/* Trends Tab */}
          {tab === 'trends' && (
            <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
              {trends.length === 0 ? (
                <div className="p-8 text-center text-sm text-[#64748B]">
                  {prevKwData.length === 0
                    ? '前回データがありません。2回目以降のKW調査CSVアップロードでトレンドが表示されます。'
                    : '大きな変動のあるキーワードはありません。'}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                      <th className="text-left py-3 px-4 font-semibold text-[#64748B]">
                        <span className="inline-flex items-center gap-1">
                          キーワード
                          <span onClick={e => e.stopPropagation()} className="inline-flex">
                            <ColumnHint text={AHREFS_COLUMN_HINTS.keyword} />
                          </span>
                        </span>
                      </th>
                      <th className="text-right py-3 px-4 font-semibold text-[#64748B]">
                        <span className="inline-flex items-center justify-end gap-1 w-full">
                          前回Vol
                          <span onClick={e => e.stopPropagation()} className="inline-flex">
                            <ColumnHint text={AHREFS_COLUMN_HINTS.trendPrevVol} />
                          </span>
                        </span>
                      </th>
                      <th className="text-right py-3 px-4 font-semibold text-[#64748B]">
                        <span className="inline-flex items-center justify-end gap-1 w-full">
                          今回Vol
                          <span onClick={e => e.stopPropagation()} className="inline-flex">
                            <ColumnHint text={AHREFS_COLUMN_HINTS.trendCurrVol} />
                          </span>
                        </span>
                      </th>
                      <th className="text-right py-3 px-4 font-semibold text-[#64748B]">
                        <span className="inline-flex items-center justify-end gap-1 w-full">
                          変化率
                          <span onClick={e => e.stopPropagation()} className="inline-flex">
                            <ColumnHint text={AHREFS_COLUMN_HINTS.trendChangeRate} />
                          </span>
                        </span>
                      </th>
                      <th className="text-center py-3 px-4 font-semibold text-[#64748B]">
                        <span className="inline-flex items-center justify-center gap-1 w-full">
                          状態
                          <span onClick={e => e.stopPropagation()} className="inline-flex">
                            <ColumnHint text={AHREFS_COLUMN_HINTS.trendStatus} />
                          </span>
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {trends.slice(0, showCount).map(t => (
                      <tr key={t.keyword} className="border-b border-[#E2E8F0] hover:bg-[#F8FAFC]/50">
                        <td className="py-3 px-4 font-medium text-[#1A1A2E]">{t.keyword}</td>
                        <td className="py-3 px-4 text-right text-[#64748B]">{t.previousVolume.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right text-[#1A1A2E] font-medium">{t.currentVolume.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-bold text-green-600">+{t.changeRate}%</td>
                        <td className="py-3 px-4 text-center">
                          {t.isNew
                            ? <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 font-medium">NEW</span>
                            : <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-medium">上昇</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {trends.length > showCount && (
                <div className="p-4 text-center border-t border-[#E2E8F0]">
                  <button onClick={() => setShowCount(p => p + 50)} className="text-sm text-[#33B5E5] hover:text-[#2AA3D0] font-medium">
                    さらに表示（残り {trends.length - showCount} 件）
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Table: opportunities / all / organic */}
          {(tab === 'opportunities' || tab === 'organic') && (
            <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm table-fixed">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                      <th style={{ width: isOrganicTab ? '17%' : '20%' }} className="text-left py-3 px-4 font-semibold text-[#64748B] cursor-pointer select-none" onClick={() => handleSort('keyword')}>
                        <span className="inline-flex items-center gap-1 flex-wrap">
                          <span className="inline-flex items-center gap-1">キーワード <SortIcon field="keyword" /></span>
                          <span onClick={e => e.stopPropagation()} className="inline-flex">
                            <ColumnHint text={AHREFS_COLUMN_HINTS.keyword} />
                          </span>
                        </span>
                      </th>
                      <th style={{ width: isOrganicTab ? '7%' : '8%' }} className="text-right py-3 px-4 font-semibold text-[#64748B] cursor-pointer select-none" onClick={() => handleSort('volume')}>
                        <span className="inline-flex items-center justify-end gap-1 w-full">
                          <span className="inline-flex items-center gap-1">Volume <SortIcon field="volume" /></span>
                          <span onClick={e => e.stopPropagation()} className="inline-flex">
                            <ColumnHint text={AHREFS_COLUMN_HINTS.volume} />
                          </span>
                        </span>
                      </th>
                      <th style={{ width: isOrganicTab ? '5%' : '7%' }} className="text-right py-3 px-4 font-semibold text-[#64748B] cursor-pointer select-none" onClick={() => handleSort('kd')}>
                        <span className="inline-flex items-center justify-end gap-1 w-full">
                          <span className="inline-flex items-center gap-1">KD <SortIcon field="kd" /></span>
                          <span onClick={e => e.stopPropagation()} className="inline-flex">
                            <ColumnHint text={AHREFS_COLUMN_HINTS.kd} />
                          </span>
                        </span>
                      </th>
                      <th style={{ width: isOrganicTab ? '6%' : '7%' }} className="text-right py-3 px-4 font-semibold text-[#64748B] cursor-pointer select-none" onClick={() => handleSort('cpc')}>
                        <span className="inline-flex items-center justify-end gap-1 w-full">
                          <span className="inline-flex items-center gap-1">CPC <SortIcon field="cpc" /></span>
                          <span onClick={e => e.stopPropagation()} className="inline-flex">
                            <ColumnHint text={AHREFS_COLUMN_HINTS.cpc} />
                          </span>
                        </span>
                      </th>
                      <th style={{ width: '8%' }} className="text-center py-3 px-4 font-semibold text-[#64748B] cursor-pointer select-none" onClick={() => handleSort('priority')}>
                        <span className="inline-flex items-center justify-center gap-1 w-full flex-wrap">
                          <span className="inline-flex items-center gap-1">優先度 <SortIcon field="priority" /></span>
                          <span onClick={e => e.stopPropagation()} className="inline-flex">
                            <ColumnHint text={isOrganicTab ? AHREFS_COLUMN_HINTS.priorityOrganic : AHREFS_COLUMN_HINTS.priorityKeywords} />
                          </span>
                        </span>
                      </th>
                      <th style={{ width: isOrganicTab ? '6%' : '7%' }} className="text-right py-3 px-4 font-semibold text-[#64748B] cursor-pointer select-none" onClick={() => handleSort('score')}>
                        <span className="inline-flex items-center justify-end gap-1 w-full">
                          <span className="inline-flex items-center gap-1">スコア <SortIcon field="score" /></span>
                          <span onClick={e => e.stopPropagation()} className="inline-flex">
                            <ColumnHint text={isOrganicTab ? AHREFS_COLUMN_HINTS.scoreOrganic : AHREFS_COLUMN_HINTS.scoreKeywords} />
                          </span>
                        </span>
                      </th>
                      {isOrganicTab && (
                        <>
                          <th style={{ width: '5%' }} className="text-right py-3 px-4 font-semibold text-[#64748B] cursor-pointer select-none" onClick={() => handleSort('position')}>
                            <span className="inline-flex items-center justify-end gap-1 w-full">
                              <span className="inline-flex items-center gap-1">順位 <SortIcon field="position" /></span>
                              <span onClick={e => e.stopPropagation()} className="inline-flex">
                                <ColumnHint text={AHREFS_COLUMN_HINTS.position} />
                              </span>
                            </span>
                          </th>
                          <th style={{ width: '7%' }} className="text-right py-3 px-4 font-semibold text-[#64748B] cursor-pointer select-none" onClick={() => handleSort('trafficChange')}>
                            <span className="inline-flex items-center justify-end gap-1 w-full">
                              <span className="inline-flex items-center gap-1">流入変動 <SortIcon field="trafficChange" /></span>
                              <span onClick={e => e.stopPropagation()} className="inline-flex">
                                <ColumnHint text={AHREFS_COLUMN_HINTS.trafficChange} />
                              </span>
                            </span>
                          </th>
                        </>
                      )}
                      <th style={{ width: isOrganicTab ? '9%' : '10%' }} className="text-center py-3 px-4 font-semibold text-[#64748B]">
                        <span className="inline-flex items-center justify-center gap-1 w-full">
                          カテゴリ
                          <span onClick={e => e.stopPropagation()} className="inline-flex">
                            <ColumnHint text={AHREFS_COLUMN_HINTS.category} />
                          </span>
                        </span>
                      </th>
                      <th style={{ width: isOrganicTab ? '9%' : '10%' }} className="text-center py-3 px-4 font-semibold text-[#64748B]">
                        <span className="inline-flex items-center justify-center gap-1 w-full">
                          投稿日
                          <span onClick={e => e.stopPropagation()} className="inline-flex">
                            <ColumnHint text={AHREFS_COLUMN_HINTS.postedDate} />
                          </span>
                        </span>
                      </th>
                      <th style={{ width: isOrganicTab ? '10%' : '14%' }} className="text-center py-3 px-4 font-semibold text-[#64748B]">
                        <span className="inline-flex items-center justify-center gap-1 w-full">
                          アクション
                          <span onClick={e => e.stopPropagation()} className="inline-flex">
                            <ColumnHint text={AHREFS_COLUMN_HINTS.action} />
                          </span>
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, showCount).map((kw, i) => (
                      <tr key={`${kw.keyword}-${i}`} className="border-b border-[#E2E8F0] hover:bg-[#F8FAFC]/50">
                        <td className="py-3 px-4 font-medium text-[#1A1A2E]">
                          <span className="block truncate">{kw.keyword}</span>
                          {isOrganicTab && kw.url && (
                            <span className="block text-[10px] text-[#94A3B8] truncate mt-0.5">{kw.url}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-[#1A1A2E]">{kw.volume.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right">
                          <span className={`font-medium ${kdColor(kw.kd)}`}>{kw.kd}</span>
                        </td>
                        <td className="py-3 px-4 text-right text-[#64748B]">{kw.cpc > 0 ? `¥${kw.cpc}` : '-'}</td>
                        <td className="py-3 px-4 text-center"><PriorityBadge level={kw.priority} /></td>
                        <td className="py-3 px-4 text-right">
                          <span className={`font-bold ${kw.score >= scoreStrong ? 'text-[#009AE0]' : kw.score >= scoreWeak ? 'text-[#1A1A2E]' : 'text-[#94A3B8]'}`}>
                            {kw.score}
                          </span>
                        </td>
                        {isOrganicTab && (
                          <>
                            <td className="py-3 px-4 text-right text-[#1A1A2E] font-medium">{kw.position ?? '-'}</td>
                            <td className="py-3 px-4 text-right">
                              {kw.trafficChange != null ? (
                                <span className={kw.trafficChange > 0 ? 'text-green-600 font-medium' : kw.trafficChange < 0 ? 'text-red-500 font-medium' : 'text-[#64748B]'}>
                                  {kw.trafficChange > 0 ? '+' : ''}{kw.trafficChange.toLocaleString()}
                                </span>
                              ) : '-'}
                            </td>
                          </>
                        )}
                        <td className="py-3 px-4 text-center">
                          <span className="px-2 py-0.5 rounded-full text-xs bg-[#F1F5F9] text-[#64748B] font-medium truncate inline-block max-w-full">
                            {kw.assignedCategory}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {(() => {
                            const entries = kwWpEntriesByNorm.get(normalizeKeywordForArticleMatch(kw.keyword))
                            if (!entries?.length) {
                              return <span className="text-[#CBD5E1] text-xs">-</span>
                            }
                            const latest = entries[entries.length - 1]!
                            const tooltip = entries
                              .map(e => {
                                const link = e.wordpressUrl ? `\n${e.wordpressUrl}` : ''
                                return `${e.displayPart}：${e.title}${link}`
                              })
                              .join('\n\n')
                            const color =
                              latest.postStatus === 'publish' ? 'text-green-700' :
                              latest.postStatus === 'future'  ? 'text-purple-700' :
                              'text-[#64748B]'
                            return (
                              <span
                                title={tooltip}
                                className={`inline-flex items-center gap-0.5 text-xs font-medium whitespace-nowrap ${color}`}
                              >
                                {latest.displayPart}
                              </span>
                            )
                          })()}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {(() => {
                            const wpEntries = kwWpEntriesByNorm.get(normalizeKeywordForArticleMatch(kw.keyword))
                            const { line, tooltip } = keywordActionButtonLabel(wpEntries)
                            const hasWp = Boolean(line)
                            return (
                              <button
                                type="button"
                                title={tooltip || undefined}
                                onClick={() => handleCreateArticle(kw)}
                                className={`inline-flex flex-col items-center justify-center gap-0.5 min-w-[7.5rem] px-2 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                                  hasWp
                                    ? 'bg-[#E8F6FC] text-[#0369A1] border border-[#BAE6FD] hover:bg-[#D2EEF9]'
                                    : kw.priority === 3
                                      ? 'bg-[#E67E22] hover:bg-[#D35400] text-white'
                                      : 'bg-[#009AE0] hover:bg-[#0088C6] text-white'
                                }`}
                              >
                                {hasWp ? (
                                  <>
                                    <span className="leading-tight text-[11px] font-semibold">{line}</span>
                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium opacity-90">
                                      <ArrowRight size={10} /> 記事作成
                                    </span>
                                  </>
                                ) : (
                                  <span className="inline-flex items-center gap-1">
                                    <ArrowRight size={12} /> 記事作成
                                  </span>
                                )}
                              </button>
                            )
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filtered.length > showCount && (
                <div className="p-4 text-center border-t border-[#E2E8F0]">
                  <button onClick={() => setShowCount(p => p + 50)} className="text-sm text-[#33B5E5] hover:text-[#2AA3D0] font-medium">
                    さらに表示（残り {filtered.length - showCount} 件）
                  </button>
                </div>
              )}
              {filtered.length === 0 && (
                <div className="p-8 text-center text-sm text-[#64748B]">条件に一致するキーワードがありません。</div>
              )}
            </div>
          )}
        </>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-base font-bold text-[#1A1A2E] mb-2">このデータセットを削除しますか？</h2>
            <p className="text-xs text-[#64748B] mb-4">削除すると元に戻せません。</p>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setDeleteTarget(null)}>キャンセル</Button>
              <Button variant="primary" onClick={() => handleDelete(deleteTarget)}>削除する</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
