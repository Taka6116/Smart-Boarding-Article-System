'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SavedArticle } from '@/lib/types'
import { getAllArticles, saveArticle, deleteArticle } from '@/lib/articleStorage'
import { applyInternalLinksToText } from '@/lib/internalLinks'
import { setSessionPreviewImage } from '@/lib/sessionPreviewImage'
import {
  FileText,
  ExternalLink,
  Copy,
  Trash2,
  Filter,
  Eye,
  FileDigit,
  Calendar,
  ChevronDown,
  ChevronUp,
  Tag,
} from 'lucide-react'
import {
  ARTICLE_CARD_PAGE_SIZE,
  formatCreatedDots,
  buildArticleExcerpt,
} from '@/lib/articleCardUtils'

type SortKey = 'dateDesc' | 'dateAsc' | 'titleAsc'

export default function PublishedArticlesPage() {
  const router = useRouter()
  const [articles, setArticles] = useState<SavedArticle[]>([])
  const [mounted, setMounted] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('dateDesc')
  const [visibleCount, setVisibleCount] = useState(ARTICLE_CARD_PAGE_SIZE)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<SavedArticle | null>(null)

  const loadArticles = async () => {
    const all = await getAllArticles()
    setArticles(all.filter(article => article.status === 'published'))
  }

  useEffect(() => {
    loadArticles().then(() => setMounted(true))
  }, [])

  useEffect(() => {
    setVisibleCount(ARTICLE_CARD_PAGE_SIZE)
  }, [articles, searchQuery, sortKey])

  const handleDuplicateToSaved = async (article: SavedArticle) => {
    const newArticle: SavedArticle = {
      ...article,
      id: `copy-${Date.now()}`,
      wordpressUrl: undefined,
      wordpressPostStatus: undefined,
      wordpressPublishedAt: undefined,
      status: 'draft',
      createdAt: new Date().toISOString(),
      scheduledDate: undefined,
      imageUrl: '',
    }
    try {
      await saveArticle(newArticle)
      setCopiedId(article.id)
      setTimeout(() => setCopiedId(null), 2000)
      await loadArticles()
    } catch (e) {
      alert(e instanceof Error ? e.message : '保存に失敗しました')
    }
  }

  const handleDelete = (article: SavedArticle) => {
    setConfirmTarget(article)
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
      params.set('source', 'published')
      router.push(`/preview?${params.toString()}`)
    },
    [router]
  )

  const filteredAndSorted = useMemo(() => {
    let list = [...articles]

    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter(a => {
        const title = (a.refinedTitle || a.title || '').toLowerCase()
        const kw = (a.targetKeyword || '').toLowerCase()
        return title.includes(q) || kw.includes(q)
      })
    }

    list.sort((a, b) => {
      if (sortKey === 'titleAsc') {
        return (a.refinedTitle || a.title).localeCompare(b.refinedTitle || b.title, 'ja')
      }
      const ta = new Date(a.createdAt).getTime()
      const tb = new Date(b.createdAt).getTime()
      return sortKey === 'dateAsc' ? ta - tb : tb - ta
    })
    return list
  }, [articles, searchQuery, sortKey])

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
            過去投稿済み記事一覧
          </h1>
          <p className="text-sm mt-1 text-[#64748B] max-w-2xl" style={{ whiteSpace: 'pre-line' }}>
            {`投稿済みの記事をカードで一覧できます。プレビュー・複製・削除が可能です。\n削除しても WordPress 上の公開記事自体は削除されません。`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFilterOpen(v => !v)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-all self-start sm:self-auto"
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
      </div>

      {filterOpen && (
        <div
          className="rounded-xl p-4 mb-6 grid gap-4 sm:grid-cols-2"
          style={{ background: 'white', border: '1px solid #E2E8F0' }}
        >
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
              投稿済み記事はまだありません
            </p>
          </div>
        </div>
      )}

      {articles.length > 0 && (
        <p className="text-xs font-medium text-[#94A3B8] mb-4">
          {filteredAndSorted.length} 件
          {filteredAndSorted.length !== articles.length && `（全 ${articles.length} 件中）`}
        </p>
      )}

      {articles.length > 0 && filteredAndSorted.length === 0 && (
        <div
          className="rounded-xl p-12 text-center text-sm text-[#94A3B8]"
          style={{ background: 'white', border: '1px solid #E2E8F0' }}
        >
          条件に一致する記事がありません。検索や並び替えを調整してください。
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {visibleArticles.map(article => {
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
                  <img src={article.imageUrl} alt="" className="w-full h-full object-cover" />
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
                  投稿済み
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
                    className="text-[10px] px-2 py-0.5 rounded-full mb-2 w-fit"
                    style={{
                      color: '#1A9FCC',
                      background: '#F0F4FF',
                      border: '1px solid #C7D7FF',
                    }}
                  >
                    KW: {article.targetKeyword}
                  </span>
                ) : null}

                <div className="mb-3 min-h-0">
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-[#94A3B8] mb-1.5">
                    <Tag size={11} className="flex-shrink-0" aria-hidden />
                    投稿タグ
                  </div>
                  {article.wordpressTags && article.wordpressTags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {article.wordpressTags.map((tag, i) => (
                        <span
                          key={`${tag}-${i}`}
                          className="text-[10px] px-2 py-0.5 rounded-md max-w-full truncate"
                          style={{
                            color: '#334155',
                            background: '#F1F5F9',
                            border: '1px solid #CBD5E1',
                          }}
                          title={tag}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-[#94A3B8] leading-snug">タグなし</p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 mt-auto pt-3 border-t border-[#F1F5F9]">
                  <button
                    type="button"
                    onClick={() => void handlePreview(article)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1A9FCC] hover:underline py-2"
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
                        className="p-2 rounded-lg hover:bg-[#F0F4FF] text-[#1A9FCC]"
                        aria-label="WordPressで開く"
                      >
                        <ExternalLink size={16} />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleDuplicateToSaved(article)}
                      className="p-2 rounded-lg hover:bg-[#F0F4FF] text-[#1A9FCC]"
                      aria-label={copiedId === article.id ? '複製しました' : '保存済みに複製'}
                      title={copiedId === article.id ? '複製しました' : '保存済みに複製'}
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(article)}
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

      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            className="w-full max-w-md rounded-xl p-6 space-y-4"
            style={{ background: 'white', boxShadow: '0 10px 25px rgba(15,23,42,0.18)' }}
          >
            <h2 className="text-base font-semibold" style={{ color: '#1A1A2E' }}>
              記事を一覧から削除しますか？
            </h2>
            <p className="text-sm" style={{ color: '#64748B', whiteSpace: 'pre-line' }}>
              {`「${(confirmTarget.refinedTitle || confirmTarget.title).slice(0, 30)}…」を一覧から削除しますか？\n（WordPress上の記事は削除されません）`}
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: '#E2E8F0', color: '#1F2933' }}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deleteArticle(confirmTarget.id)
                  setConfirmTarget(null)
                  await loadArticles()
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: '#DC2626', color: 'white' }}
              >
                <Trash2 size={14} />
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
