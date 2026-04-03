'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Trash2, X, TrendingUp, Target, ArrowRight, Search, ChevronDown, Sparkles, Globe } from 'lucide-react'
import Button from '@/components/ui/Button'
import type { AhrefsKeywordRow, AhrefsDataset, AhrefsDatasetType } from '@/lib/ahrefsCsvParser'
import { analyzeKeywords, detectTrends, getCategories, type ScoredKeyword, type TrendKeyword } from '@/lib/ahrefsAnalyzer'

type SortKey = 'score' | 'volume' | 'kd' | 'cpc' | 'keyword' | 'position' | 'trafficChange'
type Tab = 'opportunities' | 'trends' | 'all' | 'organic'

export default function AhrefsPage() {
  const router = useRouter()
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
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [sortAsc, setSortAsc] = useState(false)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showCount, setShowCount] = useState(50)
  const [suggestingKw, setSuggestingKw] = useState<string | null>(null)

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
  const scoredOrganic = useMemo(() => analyzeKeywords(organicData, true), [organicData])
  const trends = useMemo(() => detectTrends(kwData, prevKwData), [kwData, prevKwData])
  const categories = useMemo(() => {
    const src = tab === 'organic' ? scoredOrganic : scored
    return getCategories(src)
  }, [scored, scoredOrganic, tab])

  const activeData = tab === 'organic' ? scoredOrganic : scored

  const filtered = useMemo(() => {
    let list = activeData
    if (filterCategory !== 'all') {
      list = list.filter(k => k.category === filterCategory)
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
  }, [activeData, filterCategory, searchQuery, sortKey, sortAsc])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(false) }
  }

  const handleCreateArticle = useCallback(async (kw: ScoredKeyword) => {
    setSuggestingKw(kw.keyword)
    try {
      const pool = tab === 'organic' ? scoredOrganic : scored
      const sameCategory = pool
        .filter(k => k.category === kw.category && k.keyword !== kw.keyword)
        .slice(0, 5)
        .map(k => k.keyword)

      const res = await fetch('/api/ahrefs/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: kw.keyword,
          volume: kw.volume,
          kd: kw.kd,
          category: kw.category,
          relatedKeywords: sameCategory,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'プロンプト生成に失敗しました')

      const params = new URLSearchParams({
        targetKeyword: data.targetKeyword,
        prompt: data.suggestedPrompt,
        fromAhrefs: 'true',
      })
      router.push(`/editor?${params.toString()}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'プロンプト生成に失敗しました')
      setSuggestingKw(null)
    }
  }, [scored, scoredOrganic, tab, router])

  const SortIcon = ({ field }: { field: SortKey }) => {
    if (sortKey !== field) return <ChevronDown size={12} className="opacity-30" />
    return <ChevronDown size={12} className={`transition-transform ${sortAsc ? 'rotate-180' : ''}`} />
  }

  const hasOrganic = organicData.length > 0
  const hasKw = kwData.length > 0
  const hasData = hasKw || hasOrganic

  return (
    <div className="w-full py-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A2E] mb-1">KW分析ダッシュボード</h1>
          <p className="text-sm text-[#64748B]">
            AhrefsのCSVデータから狙い目キーワードを分析し、記事制作につなげます。
          </p>
        </div>
      </div>

      {/* CSV Upload */}
      <div
        className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors mb-6 relative ${
          dragOver ? 'border-[#33B5E5] bg-[#F0F4FF]' : 'border-[#E2E8F0] bg-white'
        }`}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files) }}
      >
        <input
          type="file"
          accept=".csv"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={e => { handleUpload(e.target.files); e.target.value = '' }}
          disabled={uploading}
        />
        <Upload className="mx-auto text-[#94A3B8]" size={32} />
        <p className="mt-2 text-sm font-medium text-[#1A1A2E]">
          {uploading ? 'アップロード中...' : 'AhrefsのCSVをドラッグ＆ドロップ、またはクリック'}
        </p>
        <p className="mt-1 text-xs text-[#64748B]">Keywords Explorer / Site Explorer (Organic Keywords) のCSV対応</p>
      </div>

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
      ) : !hasData ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center text-[#64748B]">
          AhrefsのCSVをアップロードしてください。
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
              <p className="text-xs text-[#64748B] mb-1">KW調査</p>
              <p className="text-2xl font-bold text-[#1A1A2E]">{kwData.length.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
              <p className="text-xs text-[#64748B] mb-1">狙い目（スコア50+）</p>
              <p className="text-2xl font-bold text-[#33B5E5]">{scored.filter(k => k.score >= 50).length}</p>
            </div>
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
              <p className="text-xs text-[#64748B] mb-1">競合KW</p>
              <p className="text-2xl font-bold text-purple-600">{organicData.filter(k => !k.branded).length.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
              <p className="text-xs text-[#64748B] mb-1">トレンドKW</p>
              <p className="text-2xl font-bold text-orange-500">{trends.length}</p>
            </div>
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
          <div className="flex gap-1 mb-4 bg-[#F1F5F9] rounded-lg p-1 w-fit">
            {([
              { key: 'opportunities' as Tab, label: '狙い目KW', icon: Target, show: hasKw },
              { key: 'organic' as Tab, label: '競合KW', icon: Globe, show: hasOrganic },
              { key: 'trends' as Tab, label: 'トレンド', icon: TrendingUp, show: hasKw },
              { key: 'all' as Tab, label: '全データ', icon: Search, show: hasKw },
            ]).filter(t => t.show).map(t => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setFilterCategory('all'); setShowCount(50) }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  tab === t.key ? 'bg-white text-[#1A1A2E] shadow-sm' : 'text-[#64748B] hover:text-[#1A1A2E]'
                }`}
              >
                <t.icon size={14} />
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
                      <th className="text-left py-3 px-4 font-semibold text-[#64748B]">キーワード</th>
                      <th className="text-right py-3 px-4 font-semibold text-[#64748B]">前回Vol</th>
                      <th className="text-right py-3 px-4 font-semibold text-[#64748B]">今回Vol</th>
                      <th className="text-right py-3 px-4 font-semibold text-[#64748B]">変化率</th>
                      <th className="text-center py-3 px-4 font-semibold text-[#64748B]">状態</th>
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
          {(tab === 'opportunities' || tab === 'all' || tab === 'organic') && (
            <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                      <th className="text-left py-3 px-4 font-semibold text-[#64748B] cursor-pointer select-none" onClick={() => handleSort('keyword')}>
                        <span className="inline-flex items-center gap-1">キーワード <SortIcon field="keyword" /></span>
                      </th>
                      <th className="text-right py-3 px-4 font-semibold text-[#64748B] cursor-pointer select-none" onClick={() => handleSort('volume')}>
                        <span className="inline-flex items-center gap-1 justify-end">Volume <SortIcon field="volume" /></span>
                      </th>
                      <th className="text-right py-3 px-4 font-semibold text-[#64748B] cursor-pointer select-none" onClick={() => handleSort('kd')}>
                        <span className="inline-flex items-center gap-1 justify-end">KD <SortIcon field="kd" /></span>
                      </th>
                      <th className="text-right py-3 px-4 font-semibold text-[#64748B] cursor-pointer select-none" onClick={() => handleSort('cpc')}>
                        <span className="inline-flex items-center gap-1 justify-end">CPC <SortIcon field="cpc" /></span>
                      </th>
                      <th className="text-right py-3 px-4 font-semibold text-[#64748B] cursor-pointer select-none" onClick={() => handleSort('score')}>
                        <span className="inline-flex items-center gap-1 justify-end">スコア <SortIcon field="score" /></span>
                      </th>
                      {tab === 'organic' && (
                        <>
                          <th className="text-right py-3 px-4 font-semibold text-[#64748B] cursor-pointer select-none" onClick={() => handleSort('position')}>
                            <span className="inline-flex items-center gap-1 justify-end">順位 <SortIcon field="position" /></span>
                          </th>
                          <th className="text-right py-3 px-4 font-semibold text-[#64748B] cursor-pointer select-none" onClick={() => handleSort('trafficChange')}>
                            <span className="inline-flex items-center gap-1 justify-end">流入変動 <SortIcon field="trafficChange" /></span>
                          </th>
                        </>
                      )}
                      <th className="text-center py-3 px-4 font-semibold text-[#64748B]">カテゴリ</th>
                      <th className="text-center py-3 px-4 font-semibold text-[#64748B] w-28">アクション</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, showCount).map((kw, i) => (
                      <tr key={`${kw.keyword}-${i}`} className="border-b border-[#E2E8F0] hover:bg-[#F8FAFC]/50">
                        <td className="py-3 px-4 font-medium text-[#1A1A2E] max-w-[260px]">
                          <span className="block truncate">{kw.keyword}</span>
                          {tab === 'organic' && kw.url && (
                            <span className="block text-[10px] text-[#94A3B8] truncate mt-0.5">{kw.url}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-[#1A1A2E]">{kw.volume.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right">
                          <span className={`font-medium ${kw.kd <= 20 ? 'text-green-600' : kw.kd <= 50 ? 'text-orange-500' : 'text-red-500'}`}>
                            {kw.kd}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-[#64748B]">¥{kw.cpc}</td>
                        <td className="py-3 px-4 text-right">
                          <span className={`font-bold ${kw.score >= 50 ? 'text-[#33B5E5]' : kw.score >= 30 ? 'text-[#1A1A2E]' : 'text-[#94A3B8]'}`}>
                            {kw.score}
                          </span>
                        </td>
                        {tab === 'organic' && (
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
                          <span className="px-2 py-0.5 rounded-full text-xs bg-[#F1F5F9] text-[#64748B] font-medium">
                            {kw.category}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleCreateArticle(kw)}
                            disabled={suggestingKw !== null}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#33B5E5] text-white hover:bg-[#2AA3D0] disabled:opacity-50 transition-colors"
                          >
                            {suggestingKw === kw.keyword ? (
                              <><Sparkles size={12} className="animate-spin" /> 生成中...</>
                            ) : (
                              <><ArrowRight size={12} /> 記事作成</>
                            )}
                          </button>
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
