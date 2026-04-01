'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SavedArticle } from '@/lib/types'
import { getAllArticles, deleteArticle, saveArticle } from '@/lib/articleStorage'
import { applyInternalLinksToText } from '@/lib/internalLinks'
import { setSessionPreviewImage } from '@/lib/sessionPreviewImage'
import {
  FileText,
  Trash2,
  Calendar,
  ExternalLink,
  Plus,
  Filter,
  Eye,
  Pencil,
  FileDigit,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import {
  ARTICLE_CARD_PAGE_SIZE,
  formatCreatedDots,
  buildArticleExcerpt,
} from '@/lib/articleCardUtils'

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: '下書き', color: '#F59E0B', bg: '#FFFBEB' },
  ready: { label: '投稿準備完了', color: '#16A34A', bg: '#F0FDF4' },
  published: { label: '投稿済み', color: '#64748B', bg: '#F8FAFC' },
}

type SortKey = 'dateDesc' | 'dateAsc' | 'titleAsc'
type StatusFilter = 'all' | 'draft' | 'ready'

export default function ArticlesPage() {
  const router = useRouter()
  const [articles, setArticles] = useState<SavedArticle[]>([])
  const [mounted, setMounted] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('dateDesc')
  const [visibleCount, setVisibleCount] = useState(ARTICLE_CARD_PAGE_SIZE)

  const reloadArticles = async () => {
    const all = await getAllArticles()
    setArticles(all.filter(article => article.status !== 'published'))
  }

  useEffect(() => {
    reloadArticles().then(() => setMounted(true))
  }, [])

  useEffect(() => {
    setVisibleCount(ARTICLE_CARD_PAGE_SIZE)
  }, [articles, statusFilter, searchQuery, sortKey])

  const handleDelete = async (id: string) => {
    if (!confirm('この記事を削除しますか？')) return
    await deleteArticle(id)
    await reloadArticles()
  }

  const handleScheduleChange = async (id: string, date: string) => {
    const all = await getAllArticles()
    const article = all.find(a => a.id === id)
    if (article) {
      article.scheduledDate = date
      await saveArticle(article)
      await reloadArticles()
    }
  }

  const handlePublish = (article: SavedArticle) => {
    router.push(`/editor?articleId=${article.id}&step=5`)
  }

  const handlePreview = useCallback(
    async (article: SavedArticle) => {
      const content = applyInternalLinksToText(
        article.refinedContent || article.originalContent || '',
        []
      )
      sessionStorage.setItem('preview_content', content)
      await setSessionPreviewImage(article.imageUrl || null)
      const params = new URLSearchParams({
        title: (article.refinedTitle || article.title || '').trim(),
        category: 'お役立ち情報',
        date: formatCreatedDots(article.createdAt),
      })
      params.set('articleId', article.id)
      if (article.imageUrl && !article.imageUrl.startsWith('data:')) {
        params.set('imageUrl', article.imageUrl)
      }
      router.push(`/preview?${params.toString()}`)
    },
    [router]
  )

  const filteredAndSorted = useMemo(() => {
    let list = articles

    if (statusFilter !== 'all') {
      list = list.filter(a => a.status === statusFilter)
    }

    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter(a => {
        const title = (a.refinedTitle || a.title || '').toLowerCase()
        const kw = (a.targetKeyword || '').toLowerCase()
        return title.includes(q) || kw.includes(q)
      })
    }

    const sorted = [...list]
    sorted.sort((a, b) => {
      if (sortKey === 'titleAsc') {
        return (a.refinedTitle || a.title).localeCompare(b.refinedTitle || b.title, 'ja')
      }
      const ta = new Date(a.createdAt).getTime()
      const tb = new Date(b.createdAt).getTime()
      return sortKey === 'dateAsc' ? ta - tb : tb - ta
    })
    return sorted
  }, [articles, statusFilter, searchQuery, sortKey])

  const visibleArticles = useMemo(
    () => filteredAndSorted.slice(0, visibleCount),
    [filteredAndSorted, visibleCount]
  )

  const hasMore = visibleCount < filteredAndSorted.length

  if (!mounted) return null

  return (
    <div className="w-full pt-6 pb-16 px-4 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#1A1A2E' }}>
            保存済み記事一覧
          </h1>
          <p className="text-sm mt-1 text-[#64748B] max-w-2xl">
            作成済みの記事をカードで一覧できます。プレビュー・修正・投稿予定日の設定や削除が可能です。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterOpen(v => !v)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-all"
            style={{
              borderColor: '#E2E8F0',
              background: filterOpen ? '#F1F5F9' : 'white',
              color: '#475569',
            }}
          >
            <Filter size={16} />
            フィルター
            {filterOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button
            type="button"
            onClick={() => router.push('/editor')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white shadow-sm"
            style={{ background: '#1B2A4A', boxShadow: '0 2px 8px rgba(27,42,74,0.2)' }}
          >
            <Plus size={16} />
            新規作成
          </button>
        </div>
      </div>

      {filterOpen && (
        <div
          className="rounded-xl p-4 mb-6 grid gap-4 sm:grid-cols-3"
          style={{ background: 'white', border: '1px solid #E2E8F0' }}
        >
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">ステータス</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as StatusFilter)}
              className="w-full px-3 py-2 rounded-lg border border-[#E2E8F0] text-sm text-[#1A1A2E] bg-white"
            >
              <option value="all">すべて</option>
              <option value="draft">下書き</option>
              <option value="ready">投稿準備完了</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">タイトル・KW で検索</label>
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="キーワードを入力…"
              className="w-full px-3 py-2 rounded-lg border border-[#E2E8F0] text-sm text-[#1A1A2E]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#64748B] mb-1">並び替え</label>
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value as SortKey)}
              className="w-full px-3 py-2 rounded-lg border border-[#E2E8F0] text-sm text-[#1A1A2E] bg-white"
            >
              <option value="dateDesc">作成日（新しい順）</option>
              <option value="dateAsc">作成日（古い順）</option>
              <option value="titleAsc">タイトル（あいうえお順）</option>
            </select>
          </div>
        </div>
      )}

      {articles.length === 0 && (
        <div
          className="rounded-xl p-16 flex flex-col items-center gap-4 text-center"
          style={{ background: 'white', border: '1px solid #E2E8F0' }}
        >
          <FileText size={40} style={{ color: '#CBD5E1' }} />
          <div>
            <p className="font-semibold" style={{ color: '#64748B' }}>
              保存済み記事はまだありません
            </p>
            <p className="text-sm mt-1" style={{ color: '#94A3B8' }}>
              記事を作成して下書き保存すると、ここに一覧表示されます
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/editor')}
            className="mt-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: '#1B2A4A' }}
          >
            最初の記事を作成する
          </button>
        </div>
      )}

      {articles.length > 0 && (
        <>
          <p className="text-xs font-medium text-[#94A3B8] mb-4">
            {filteredAndSorted.length} 件
            {filteredAndSorted.length !== articles.length && `（全 ${articles.length} 件中）`}
          </p>
        </>
      )}

      {articles.length > 0 && filteredAndSorted.length === 0 && (
        <div
          className="rounded-xl p-12 text-center text-sm text-[#94A3B8]"
          style={{ background: 'white', border: '1px solid #E2E8F0' }}
        >
          条件に一致する記事がありません。フィルターを調整してください。
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {visibleArticles.map(article => {
          const st = STATUS_LABEL[article.status]
          const title = article.refinedTitle || article.title
          return (
            <article
              key={article.id}
              className="group flex flex-col rounded-xl overflow-hidden transition-all duration-200 hover:shadow-lg"
              style={{
                background: 'white',
                border: '1px solid #E2E8F0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}
            >
              <div className="relative aspect-[16/10] bg-[#F1F5F9] overflow-hidden">
                {article.imageUrl ? (
                  <img
                    src={article.imageUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <FileText size={36} style={{ color: '#CBD5E1' }} />
                  </div>
                )}
                <span
                  className="absolute top-2 left-2 text-[10px] font-bold tracking-wide px-2 py-1 rounded-md text-white"
                  style={{
                    background: 'rgba(27, 42, 74, 0.88)',
                    fontFamily: 'system-ui, sans-serif',
                  }}
                >
                  {st.label.toUpperCase()}
                </span>
              </div>

              <div className="p-4 flex flex-col flex-1 min-h-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#94A3B8] mb-2">
                  <span className="inline-flex items-center gap-1">
                    <Calendar size={12} />
                    {formatCreatedDots(article.createdAt)}
                  </span>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1">
                    <FileDigit size={12} />
                    {article.wordCount.toLocaleString()}文字
                  </span>
                </div>

                <h2
                  className="text-sm font-bold leading-snug text-[#1A1A2E] line-clamp-2 mb-2 min-h-[2.5rem]"
                  title={title}
                >
                  {title}
                </h2>

                <p className="text-xs text-[#64748B] leading-relaxed line-clamp-3 flex-1 mb-3">
                  {buildArticleExcerpt(article)}
                </p>

                {article.targetKeyword ? (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full mb-3 w-fit"
                    style={{
                      color: '#1B2A4A',
                      background: '#F0F4FF',
                      border: '1px solid #C7D7FF',
                    }}
                  >
                    KW: {article.targetKeyword}
                  </span>
                ) : (
                  <div className="mb-3" />
                )}

                <div className="flex items-center gap-2 mb-3 pt-2 border-t border-[#F1F5F9]">
                  <Calendar size={14} className="text-[#94A3B8] flex-shrink-0" />
                  <input
                    type="date"
                    value={article.scheduledDate ?? ''}
                    onChange={e => handleScheduleChange(article.id, e.target.value)}
                    className="flex-1 min-w-0 text-xs px-2 py-2 rounded-lg border border-[#E2E8F0] text-[#64748B]"
                    style={{ fontFamily: 'DM Mono, monospace', background: '#FAFBFC' }}
                    aria-label="投稿予定日"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 mt-auto pt-1 border-t border-[#F1F5F9]">
                  <button
                    type="button"
                    onClick={() => void handlePreview(article)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1B2A4A] hover:underline py-2"
                  >
                    <Eye size={14} />
                    プレビュー
                  </button>
                  <div className="flex items-center gap-1">
                    {article.wordpressUrl && (
                      <a
                        href={article.wordpressUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg hover:bg-[#F0F4FF] text-[#1B2A4A]"
                        aria-label="WordPressで開く"
                      >
                        <ExternalLink size={16} />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => handlePublish(article)}
                      className="p-2 rounded-lg hover:bg-[#F0F4FF] text-[#1B2A4A]"
                      aria-label="修正する"
                      title="修正する"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(article.id)}
                      className="p-2 rounded-lg hover:bg-[#FEF2F2] text-[#EF4444]"
                      aria-label="削除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {articles.length > 0 && hasMore && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleCount(c => c + ARTICLE_CARD_PAGE_SIZE)}
            className="inline-flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-semibold border-2 border-dashed transition-colors"
            style={{ borderColor: '#CBD5E1', color: '#64748B', background: '#FAFBFC' }}
          >
            さらに表示（あと {filteredAndSorted.length - visibleCount} 件）
          </button>
        </div>
      )}
    </div>
  )
}
