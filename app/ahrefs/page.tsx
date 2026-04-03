'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Trash2, X, TrendingUp, Target, ArrowRight, Search, ChevronDown, Globe, FileUp } from 'lucide-react'
import Button from '@/components/ui/Button'
import type { AhrefsKeywordRow, AhrefsDataset, AhrefsDatasetType } from '@/lib/ahrefsCsvParser'
import { analyzeKeywords, detectTrends, getCategories, type ScoredKeyword, type TrendKeyword, type PriorityLevel } from '@/lib/ahrefsAnalyzer'

type SortKey = 'priority' | 'score' | 'volume' | 'kd' | 'cpc' | 'keyword' | 'position' | 'trafficChange'
type Tab = 'opportunities' | 'trends' | 'all' | 'organic'

function PriorityBadge({ level }: { level: PriorityLevel }) {
  if (level === 3) return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white">★★★</span>
  if (level === 2) return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500 text-white">★★</span>
  if (level === 1) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">★</span>
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs text-gray-300">−</span>
}

function generateAutoPrompt(row: ScoredKeyword): string {
  const volStrategy = row.volume > 5000
    ? '包括的かつ網羅的な内容にすること。幅広い検索クエリに対応できるよう、複数の切り口で構成すること。'
    : row.volume > 1000
    ? '幅広い検索意図をカバーする構成にすること。主要な疑問を網羅しつつ、専門性も示すこと。'
    : row.volume > 300
    ? 'ニッチな専門性と具体性で上位を狙えるテーマ。実務者が即活用できる情報を重視すること。'
    : '深い専門知識と具体的な事例で差別化すること。ロングテールKWとして確実に上位を取る構成にすること。'

  const kdStrategy = row.kd <= 10
    ? '競合がほぼ不在のため、基本を丁寧に押さえれば上位表示が見込めます。網羅性と読みやすさを重視してください。'
    : row.kd <= 30
    ? '独自視点・独自の切り口で差別化すれば上位の勝算があります。他社記事にはない具体例や数値を入れてください。'
    : row.kd <= 50
    ? '競合が多いテーマです。実体験・具体的数値・独自フレームワークでの差別化が必要です。'
    : '競合が非常に強いテーマです。現場知見・独自データ・E-E-A-T要素での差別化が必須です。'

  const trendNote = row.trend === 'up'
    ? `\n※トレンド注記: このKWは検索ボリュームが上昇傾向（${row.trendChangePercent > 0 ? '+' : ''}${row.trendChangePercent}%）にあります。最新のトレンドや動向を積極的に盛り込んでください。`
    : row.trend === 'down'
    ? `\n※トレンド注記: このKWは検索ボリュームが下降傾向（${row.trendChangePercent}%）です。定番・基本情報としての価値を重視し、エバーグリーンコンテンツとして設計してください。`
    : ''

  const priorityLabel = row.priority === 3 ? '★★★ 即攻め' : row.priority === 2 ? '★★ 有望' : row.priority === 1 ? '★ 余力あれば' : '低'

  const categoryIntents: Record<string, string> = {
    '人材育成': '\n・人材育成の体系的な方法論・最新トレンドを知りたい\n・自社の育成計画を見直したい・改善したい',
    'eラーニング': '\n・eラーニング導入のメリット・デメリットを比較したい\n・効果的なオンライン学習の設計方法を知りたい',
    '研修': '\n・研修の企画・設計・評価の方法を体系的に知りたい\n・研修効果を最大化するための工夫を知りたい',
    'オンボーディング': '\n・新入社員の早期戦力化のための仕組みを知りたい\n・オンボーディングプログラムの設計・改善方法を知りたい',
    'マネジメント': '\n・管理職として必要なスキル・マインドセットを知りたい\n・部下育成や1on1ミーティングの効果的な方法を知りたい',
    '評価・制度': '\n・人事評価制度の設計・運用のベストプラクティスを知りたい\n・MBO/OKRなど目標管理手法の導入方法を知りたい',
    'DX・IT': '\n・DX推進に必要な人材育成の方法を知りたい\n・デジタルスキル向上のための研修設計を知りたい',
    'コンプライアンス': '\n・ハラスメント防止研修の効果的な設計方法を知りたい\n・コンプライアンス教育の最新アプローチを知りたい',
    'エンゲージメント': '\n・従業員エンゲージメント向上の施策を知りたい\n・離職防止・リテンション施策の具体例を知りたい',
    'OJT': '\n・OJTの体系的な設計・運用方法を知りたい\n・OJTトレーナーの育成方法を知りたい',
  }

  const additionalIntents = categoryIntents[row.assignedCategory] ?? ''

  return `■ロール設定
あなたはSmart Boarding（スマートボーディング）／株式会社FCEの上級コンテンツ戦略コンサルタントです。SEO・LLMOの専門知見に基づき、検索ユーザーのペインを的確に解決しながら、Smart Boardingのサービスへの自然な導線を設計してください。

■目的
- 検索流入を獲得する（SEO最適化）
- E-E-A-T（経験・専門性・権威性・信頼性）を示す
- 読者の具体的なペインを解決する

■テーマ
「${row.keyword}」

■KWデータに基づく執筆方針
- ターゲットキーワード: ${row.keyword}
- 月間検索ボリューム: ${row.volume.toLocaleString()}
- キーワード難易度(KD): ${row.kd}
- CPC: ¥${row.cpc}
- カテゴリ: ${row.assignedCategory}
- 優先度: ${priorityLabel}

【Volume戦略】${volStrategy}
【KD戦略】${kdStrategy}
【CPC戦略】CPC ¥${row.cpc} — ${row.cpc >= 500 ? '商業的意図が非常に強いKWです。CTAを明確に設計し、サービス紹介セクションを充実させてください。' : row.cpc >= 100 ? '商業的意図があるKWです。記事後半に自然なCTAを設置してください。' : '情報収集段階のKWです。まず信頼を獲得し、CTAは控えめに。'}
${trendNote}

■検索意図の整理
このKWで検索するユーザーが知りたいこと：
・「${row.keyword}」の基本的な意味・概要を理解したい
・具体的なやり方・手順・方法を知りたい
・導入メリット・効果を理解したい
・成功事例・失敗事例から学びたい${additionalIntents}

■ターゲット
人事担当者、研修企画者、人材育成責任者、経営層

■必須条件
1. S3に格納された参照資料（社内ナレッジ・過去記事）を必ず参照し、Smart Boardingの知見を反映すること
2. 実務で即使える具体的な手順・チェックリスト・フレームワークを含めること
3. 統計データや調査結果を引用する場合は出典を明記すること
4. Smart Boardingの強み（法人向けオンライントレーニング × 人財コンサルティング × 実践型プログラム）を自然に組み込むこと

■構成要件（SEO・LLMO最適化）
- タイトル: 32文字以内、ターゲットKWを含む
- H2: 5〜8個、各H2にKWまたは関連語を含む
- H3: 各H2配下に2〜4個
- 本文: 4,000〜8,000文字
- リスト・表・箇条書きを効果的に使用
- 冒頭200文字以内にKWと記事の結論を含める

■品質要件
- 中学生でも理解できる平易な日本語
- 一文は60文字以内を目安
- 「です・ます」調で統一
- 具体例・数値を豊富に含める

■SEO・LLMO要件
- メタディスクリプション: 120文字以内
- ターゲットKWの自然な出現（キーワード密度1〜3%）
- 関連キーワードの自然な散りばめ
- FAQ構造化データに適した Q&A セクションを含める

■出力形式
- Markdown形式
- H1（タイトル）→ リード文 → H2/H3構成 → まとめ → FAQ`
}

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
  const scoredOrganic = useMemo(() => analyzeKeywords(organicData, true), [organicData])
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
              { key: 'all' as Tab, label: '全データ', show: hasKw },
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
                <table className="w-full text-sm table-fixed">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                      <th style={{ width: isOrganicTab ? '20%' : '26%' }} className="text-left py-3 px-4 font-semibold text-[#64748B] cursor-pointer select-none" onClick={() => handleSort('keyword')}>
                        <span className="inline-flex items-center gap-1">キーワード <SortIcon field="keyword" /></span>
                      </th>
                      <th style={{ width: '8%' }} className="text-right py-3 px-4 font-semibold text-[#64748B] cursor-pointer select-none" onClick={() => handleSort('volume')}>
                        <span className="inline-flex items-center gap-1 justify-end">Volume <SortIcon field="volume" /></span>
                      </th>
                      <th style={{ width: '7%' }} className="text-right py-3 px-4 font-semibold text-[#64748B] cursor-pointer select-none" onClick={() => handleSort('kd')}>
                        <span className="inline-flex items-center gap-1 justify-end">KD <SortIcon field="kd" /></span>
                      </th>
                      <th style={{ width: '7%' }} className="text-right py-3 px-4 font-semibold text-[#64748B] cursor-pointer select-none" onClick={() => handleSort('cpc')}>
                        <span className="inline-flex items-center gap-1 justify-end">CPC <SortIcon field="cpc" /></span>
                      </th>
                      <th style={{ width: '8%' }} className="text-center py-3 px-4 font-semibold text-[#64748B] cursor-pointer select-none" onClick={() => handleSort('priority')}>
                        <span className="inline-flex items-center gap-1 justify-center">優先度 <SortIcon field="priority" /></span>
                      </th>
                      <th style={{ width: '7%' }} className="text-right py-3 px-4 font-semibold text-[#64748B] cursor-pointer select-none" onClick={() => handleSort('score')}>
                        <span className="inline-flex items-center gap-1 justify-end">スコア <SortIcon field="score" /></span>
                      </th>
                      {isOrganicTab && (
                        <>
                          <th style={{ width: '7%' }} className="text-right py-3 px-4 font-semibold text-[#64748B] cursor-pointer select-none" onClick={() => handleSort('position')}>
                            <span className="inline-flex items-center gap-1 justify-end">順位 <SortIcon field="position" /></span>
                          </th>
                          <th style={{ width: '8%' }} className="text-right py-3 px-4 font-semibold text-[#64748B] cursor-pointer select-none" onClick={() => handleSort('trafficChange')}>
                            <span className="inline-flex items-center gap-1 justify-end">流入変動 <SortIcon field="trafficChange" /></span>
                          </th>
                        </>
                      )}
                      <th style={{ width: isOrganicTab ? '10%' : '12%' }} className="text-center py-3 px-4 font-semibold text-[#64748B]">カテゴリ</th>
                      <th style={{ width: isOrganicTab ? '10%' : '12%' }} className="text-center py-3 px-4 font-semibold text-[#64748B]">アクション</th>
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
                          <span className={`font-bold ${kw.score >= 50 ? 'text-[#009AE0]' : kw.score >= 30 ? 'text-[#1A1A2E]' : 'text-[#94A3B8]'}`}>
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
                          <button
                            onClick={() => handleCreateArticle(kw)}
                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors ${
                              kw.priority === 3
                                ? 'bg-[#E67E22] hover:bg-[#D35400]'
                                : 'bg-[#009AE0] hover:bg-[#0088C6]'
                            }`}
                          >
                            <ArrowRight size={12} /> 記事作成
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
