'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { SavedArticle } from '@/lib/types'
import { resolveCanonicalPostSlug } from '@/lib/slugNormalize'
import { getAllArticles, saveArticle, deleteArticle } from '@/lib/articleStorage'
import {
  ChevronLeft,
  ChevronRight,
  Send,
  Pencil,
  FileText,
  CalendarDays,
  Trash2,
  Clock,
  Loader2,
  List,
} from 'lucide-react'
import { snapScheduledTimeToQuarterHour } from '@/lib/scheduledTimeQuarterHour'

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}
function toYMD(date: Date) {
  return date.toISOString().slice(0, 10)
}
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']
const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

function getScheduleStage(article: SavedArticle): {
  key: string
  label: string
  color: string
  bg: string
} {
  if (!article.scheduledDate) {
    return { key: 'unscheduled', label: '投稿日未設定', color: '#94A3B8', bg: '#F1F5F9' }
  }
  const hasTime = Boolean(article.scheduledTime?.trim())
  if (!hasTime) {
    return { key: 'date_only', label: '投稿日のみ確定', color: '#0369A1', bg: '#E0F2FE' }
  }
  if (article.wordpressPostStatus === 'future') {
    return { key: 'wp_future', label: 'WP予約投稿済み', color: '#6D28D9', bg: '#EDE9FE' }
  }
  if (article.wordpressPostStatus === 'publish') {
    return { key: 'wp_publish', label: 'WP公開済み', color: '#475569', bg: '#F8FAFC' }
  }
  if (article.wordpressUrl) {
    return { key: 'wp_sent', label: 'WordPress送信済み', color: '#64748B', bg: '#F1F5F9' }
  }
  return {
    key: 'datetime_ready',
    label: '公開日時まで設定（WP未送信）',
    color: '#15803D',
    bg: '#DCFCE7',
  }
}

function sortKeyForScheduled(a: SavedArticle): string {
  const d = a.scheduledDate ?? ''
  const t = a.scheduledTime?.trim() ? a.scheduledTime! : '99:99'
  return `${d}T${t}`
}

function getScheduledInstant(article: SavedArticle): number {
  const d = article.scheduledDate!
  if (article.scheduledTime?.trim()) {
    return new Date(`${d}T${article.scheduledTime.trim()}:00`).getTime()
  }
  const [y, mo, day] = d.split('-').map(Number)
  return new Date(y, mo - 1, day, 23, 59, 59, 999).getTime()
}

function isUpcomingScheduled(article: SavedArticle): boolean {
  if (!article.scheduledDate) return false
  return getScheduledInstant(article) > Date.now()
}

export default function SchedulePage() {
  const router = useRouter()
  const today = new Date()

  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState(toYMD(today))
  const [articles, setArticles] = useState<SavedArticle[]>([])
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleteUnscheduledId, setDeleteUnscheduledId] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [publishResult, setPublishResult] = useState<{ articleId: string; success: boolean; message: string } | null>(null)
  const [customSlugIds, setCustomSlugIds] = useState<Set<string>>(new Set())
  const [scheduleListThisMonthOnly, setScheduleListThisMonthOnly] = useState(true)

  useEffect(() => {
    getAllArticles().then(async all => {
      const toFix = all.filter(a => {
        if (!a.scheduledTime?.trim()) return false
        return snapScheduledTimeToQuarterHour(a.scheduledTime) !== a.scheduledTime.trim()
      })
      if (toFix.length) {
        await Promise.all(
          toFix.map(a =>
            saveArticle({
              ...a,
              scheduledTime: snapScheduledTimeToQuarterHour(a.scheduledTime!),
            })
          )
        )
        setArticles(await getAllArticles())
      } else {
        setArticles(all)
      }
      setMounted(true)
    })
  }, [])

  const articlesByDate = useMemo(() => {
    const map: Record<string, SavedArticle[]> = {}
    articles.forEach(a => {
      const d = a.scheduledDate
      if (d) {
        if (!map[d]) map[d] = []
        map[d].push(a)
      }
    })
    return map
  }, [articles])

  const scheduledArticlesSorted = useMemo(() => {
    const withDate = articles.filter(a => a.scheduledDate)
    return [...withDate].sort((a, b) => sortKeyForScheduled(a).localeCompare(sortKeyForScheduled(b)))
  }, [articles])

  const scheduleTableRows = useMemo(() => {
    const upcoming = scheduledArticlesSorted.filter(isUpcomingScheduled)
    if (!scheduleListThisMonthOnly) return upcoming
    const y = year
    const m = month + 1
    const prefix = `${y}-${String(m).padStart(2, '0')}`
    return upcoming.filter(a => a.scheduledDate?.startsWith(prefix))
  }, [scheduledArticlesSorted, scheduleListThisMonthOnly, year, month])

  const selectedArticles = articlesByDate[selectedDate] ?? []

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1)
  }

  const daysInMonth = getDaysInMonth(year, month)
  const firstDayOfWeek = getFirstDayOfMonth(year, month)
  const calendarCells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (calendarCells.length % 7 !== 0) calendarCells.push(null)

  const handleScheduleChange = async (articleId: string, date: string) => {
    const all = await getAllArticles()
    const a = all.find(x => x.id === articleId)
    if (a) { a.scheduledDate = date; await saveArticle(a); setArticles(await getAllArticles()) }
  }

  const handleTimeChange = async (articleId: string, time: string) => {
    const normalized = snapScheduledTimeToQuarterHour(time)
    const all = await getAllArticles()
    const a = all.find(x => x.id === articleId)
    if (a) { a.scheduledTime = normalized; await saveArticle(a); setArticles(await getAllArticles()) }
  }

  const handleSlugChange = async (articleId: string, newSlug: string) => {
    const all = await getAllArticles()
    const a = all.find(x => x.id === articleId)
    if (a) { a.slug = newSlug; await saveArticle(a); setArticles(await getAllArticles()) }
  }

  const handleScheduledPublish = async (article: SavedArticle) => {
    if (!article.scheduledDate || !article.scheduledTime) return
    setPublishingId(article.id)
    setPublishResult(null)
    try {
      const scheduledDate = `${article.scheduledDate}T${article.scheduledTime}:00`
      const content = article.refinedContent || article.originalContent || ''
      const res = await fetch('/api/wordpress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: article.refinedTitle || article.title,
          content,
          targetKeyword: article.targetKeyword,
          imageUrl: article.imageUrl,
          status: 'future',
          scheduledDate,
          slug: resolveCanonicalPostSlug(article.slug?.trim() ?? ''),
          wordpressTags: article.wordpressTags?.length ? article.wordpressTags : undefined,
        }),
      })
      const data = await res.json()
      if (res.ok && data.postId) {
        const all = await getAllArticles()
        const a = all.find(x => x.id === article.id)
        if (a) {
          a.status = 'published'
          a.wordpressUrl = data.wordpressUrl
          if (typeof data.status === 'string' && data.status) a.wordpressPostStatus = data.status
          if (typeof data.dateGmt === 'string' && data.dateGmt.trim()) a.wordpressPublishedAt = data.dateGmt.trim()
          await saveArticle(a)
          setArticles(await getAllArticles())
        }
        const dateObj = new Date(scheduledDate)
        const timeStr = `${dateObj.getMonth() + 1}月${dateObj.getDate()}日 ${article.scheduledTime}`
        setPublishResult({ articleId: article.id, success: true, message: `予約投稿しました（${timeStr} 公開予定）` })
      } else {
        setPublishResult({ articleId: article.id, success: false, message: data.error || '予約投稿に失敗しました' })
      }
    } catch {
      setPublishResult({ articleId: article.id, success: false, message: 'ネットワークエラーが発生しました' })
    } finally {
      setPublishingId(null)
    }
  }

  const handleDeleteConfirmed = async () => {
    if (!deleteTargetId) return
    const all = await getAllArticles()
    const target = all.find(x => x.id === deleteTargetId)
    if (target) {
      target.scheduledDate = undefined
      target.scheduledTime = undefined
      await saveArticle(target)
    }
    setArticles(await getAllArticles())
    setDeleteTargetId(null)
  }

  const handleDeleteUnscheduledConfirmed = async () => {
    if (!deleteUnscheduledId) return
    await deleteArticle(deleteUnscheduledId)
    setArticles(await getAllArticles())
    setDeleteUnscheduledId(null)
  }

  if (!mounted) return null

  // ─── Shared inline style helpers ───────────────────────────────────────────
  const surface = { background: 'var(--sbas-surface)', boxShadow: 'var(--sbas-shadow-panel)', borderRadius: 'var(--sbas-radius-panel)' } as const
  const controlBase = { border: '1px solid var(--sbas-border)', background: 'var(--sbas-surface-muted)', color: 'var(--sbas-text)', fontFamily: 'DM Mono, monospace', fontVariantNumeric: 'tabular-nums' } as const
  const mutedText = { color: 'var(--sbas-text-muted)' } as const

  return (
    <div
      className="w-full pt-6 pb-16 px-2"
      style={{
        background: 'radial-gradient(circle at 88% 8%, rgba(8,145,178,.08), transparent 34rem), linear-gradient(180deg, #f8fbfd 0%, #f3f7fb 100%)',
        minHeight: '100vh',
      }}
    >
      {/* ── Modal: unscheduled delete ──────────────────────────────────────── */}
      {deleteUnscheduledId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(16,24,40,0.25)' }}>
          <div className="w-full max-w-sm rounded-xl p-6" style={{ ...surface }}>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--sbas-text)' }}>この記事を削除しますか？</p>
            <p className="text-xs mb-5" style={mutedText}>削除すると元に戻せません</p>
            <div className="flex justify-end gap-2">
              <button onClick={handleDeleteUnscheduledConfirmed} className="sbas-btn-press px-4 py-2 rounded-lg text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400" style={{ background: '#DC2626' }}>削除する</button>
              <button onClick={() => setDeleteUnscheduledId(null)} className="sbas-btn-press px-4 py-2 rounded-lg text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sbas-primary)]" style={{ background: 'var(--sbas-surface-muted)', border: '1px solid var(--sbas-border)', ...mutedText }}>キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: scheduled delete ────────────────────────────────────────── */}
      {deleteTargetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(16,24,40,0.25)' }}>
          <div className="w-full max-w-sm rounded-xl p-6" style={{ ...surface }}>
            <p className="text-sm font-semibold mb-4" style={{ color: 'var(--sbas-text)' }}>本当に削除しますか？</p>
            <div className="flex justify-end gap-2">
              <button onClick={handleDeleteConfirmed} className="sbas-btn-press px-4 py-2 rounded-lg text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400" style={{ background: '#DC2626' }}>はい</button>
              <button onClick={() => setDeleteTargetId(null)} className="sbas-btn-press px-4 py-2 rounded-lg text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sbas-primary)]" style={{ background: 'var(--sbas-surface-muted)', border: '1px solid var(--sbas-border)', ...mutedText }}>いいえ</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="mb-7">
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--sbas-text)', lineHeight: 1.3 }}>投稿スケジュール</h1>
        <p style={{ fontSize: 14, marginTop: 4, ...mutedText }}>記事の投稿予定日を設定・管理できます</p>
      </div>

      {/* ── Schedule list panel ───────────────────────────────────────────── */}
      <div className="overflow-hidden mb-5" style={{ ...surface }}>
        {/* Panel header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3" style={{ borderBottom: '1px solid var(--sbas-border)', background: 'var(--sbas-surface-muted)' }}>
          <div className="flex items-center gap-2">
            <List size={14} style={{ color: 'var(--sbas-primary)' }} />
            <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--sbas-text)' }}>
              予定一覧（これから投稿する予定・日時が未来の記事）
            </h2>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none" style={{ fontSize: 12, ...mutedText }}>
            <input
              type="checkbox"
              checked={scheduleListThisMonthOnly}
              onChange={e => setScheduleListThisMonthOnly(e.target.checked)}
              className="rounded border-slate-300 focus-visible:ring-2 focus-visible:ring-[var(--sbas-primary)]"
            />
            <span>{year}年{MONTH_NAMES[month]}のみ表示</span>
          </label>
        </div>

        {scheduleTableRows.length === 0 ? (
          <p style={{ fontSize: 12, padding: '24px 0', textAlign: 'center', ...mutedText }}>
            {scheduleListThisMonthOnly ? 'この月に、今後投稿予定の記事はありません' : '今後投稿予定の記事はありません（過去の予定は表示しません）'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left" style={{ fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--sbas-surface-muted)', color: 'var(--sbas-text-muted)', borderBottom: '1px solid var(--sbas-border)' }}>
                  {['予定日', '時刻', 'タイトル', 'KW', 'タグ', 'スケジュール段階', '操作'].map((h, i) => (
                    <th key={h} style={{ padding: '10px 16px', fontWeight: 600, whiteSpace: 'nowrap', minWidth: i === 2 ? '12rem' : i === 3 ? '7rem' : i === 4 ? '10rem' : undefined }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scheduleTableRows.map(article => {
                  const stage = getScheduleStage(article)
                  const title = article.refinedTitle || article.title
                  return (
                    <tr key={article.id} className="sbas-row-hover" style={{ borderTop: '1px solid var(--sbas-border)', color: 'var(--sbas-text)' }}>
                      <td style={{ padding: '10px 16px', fontFamily: 'DM Mono,monospace', whiteSpace: 'nowrap', verticalAlign: 'top', fontVariantNumeric: 'tabular-nums' }}>{article.scheduledDate}</td>
                      <td style={{ padding: '10px 16px', fontFamily: 'DM Mono,monospace', whiteSpace: 'nowrap', verticalAlign: 'top', fontVariantNumeric: 'tabular-nums' }}>{article.scheduledTime?.trim() ? article.scheduledTime : '—'}</td>
                      <td style={{ padding: '10px 16px', verticalAlign: 'top', maxWidth: '20rem' }}>
                        <div className="line-clamp-2" title={title}>{title}</div>
                      </td>
                      <td style={{ padding: '10px 16px', verticalAlign: 'top', maxWidth: '10rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...mutedText }} title={article.targetKeyword}>{article.targetKeyword || '—'}</td>
                      <td style={{ padding: '10px 16px', verticalAlign: 'top', maxWidth: '14rem' }} title={article.wordpressTags?.length ? article.wordpressTags.join('、') : undefined}>
                        {article.wordpressTags && article.wordpressTags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {article.wordpressTags.map((tag, i) => (
                              <span key={`${article.id}-tag-${i}-${tag}`} className="text-[10px] px-1.5 py-0.5 rounded-md max-w-[8rem] truncate inline-block align-middle" style={{ color: 'var(--sbas-text)', background: 'var(--sbas-surface-muted)', border: '1px solid var(--sbas-border)' }} title={tag}>{tag}</span>
                            ))}
                          </div>
                        ) : <span style={mutedText}>—</span>}
                      </td>
                      <td style={{ padding: '10px 16px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium" style={{ color: stage.color, background: stage.bg }}>{stage.label}</span>
                      </td>
                      <td style={{ padding: '10px 16px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="sbas-btn-press text-xs font-semibold px-3 py-1.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sbas-primary)]"
                          onClick={() => {
                            if (article.scheduledDate) setSelectedDate(article.scheduledDate)
                            setYear(parseInt(article.scheduledDate!.slice(0, 4), 10))
                            setMonth(parseInt(article.scheduledDate!.slice(5, 7), 10) - 1)
                          }}
                          style={{ color: 'var(--sbas-primary)', background: 'var(--sbas-primary-soft)', border: '1px solid rgba(8,145,178,0.2)' }}
                        >
                          カレンダーで表示
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Two-column layout ─────────────────────────────────────────────── */}
      <div className="flex gap-5 items-start">

        {/* Calendar panel */}
        <div style={{ flexShrink: 0, width: 340, ...surface, padding: 20 }}>
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={prevMonth}
              aria-label="前の月"
              className="p-2 rounded-lg sbas-btn-press hover:bg-[var(--sbas-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sbas-primary)]"
              style={mutedText}
            >
              <ChevronLeft size={15} />
            </button>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--sbas-text)', fontVariantNumeric: 'tabular-nums' }}>
              {year}年 {MONTH_NAMES[month]}
            </span>
            <button
              onClick={nextMonth}
              aria-label="次の月"
              className="p-2 rounded-lg sbas-btn-press hover:bg-[var(--sbas-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sbas-primary)]"
              style={mutedText}
            >
              <ChevronRight size={15} />
            </button>
          </div>

          {/* Weekday row */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((w, i) => (
              <div key={w} className="text-center py-1" style={{ fontSize: 11, fontWeight: 600, color: i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : 'var(--sbas-text-muted)' }}>
                {w}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {calendarCells.map((day, idx) => {
              if (!day) return <div key={idx} />
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const isToday = dateStr === toYMD(today)
              const isSelected = dateStr === selectedDate
              const dayArticles = articlesByDate[dateStr] ?? []
              const hasPublished = dayArticles.some(a => a.status === 'published')
              const hasReady = dayArticles.some(a => a.status === 'ready')
              const hasDraft = dayArticles.some(a => a.status === 'draft')
              const dotColor = hasPublished ? 'var(--sbas-neutral)' : hasReady ? 'var(--sbas-success)' : hasDraft ? 'var(--sbas-warning)' : null
              const dow = (firstDayOfWeek + day - 1) % 7

              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDate(dateStr)}
                  aria-label={`${year}年${month + 1}月${day}日${isSelected ? '（選択中）' : ''}${isToday ? '（今日）' : ''}`}
                  aria-pressed={isSelected}
                  className={`sbas-cal-day${isSelected ? ' sbas-cal-day-selected' : ''} flex flex-col items-center justify-center rounded-lg py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sbas-primary)] focus-visible:ring-offset-1`}
                  style={isToday && !isSelected ? { border: '1.5px solid #dc2626', background: '#fff5f5' } : { border: '1.5px solid transparent' }}
                >
                  <span style={{
                    fontSize: 13,
                    fontWeight: 500,
                    fontVariantNumeric: 'tabular-nums',
                    color: isSelected ? 'white' : isToday ? '#dc2626' : dow === 0 ? '#ef4444' : dow === 6 ? '#3b82f6' : 'var(--sbas-text)',
                  }}>
                    {day}
                  </span>
                  {dotColor && (
                    <div className="w-1.5 h-1.5 rounded-full mt-0.5" style={{ background: isSelected ? 'rgba(255,255,255,0.75)' : dotColor }} />
                  )}
                </button>
              )
            })}
          </div>

          {/* Legend */}
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--sbas-border)' }}>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', ...mutedText, marginBottom: 8 }}>記事の編集状態（ドット）</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {[
                { color: 'var(--sbas-success)', label: '投稿準備完了' },
                { color: 'var(--sbas-warning)', label: '下書き' },
                { color: 'var(--sbas-neutral)', label: '投稿済み' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <span style={{ fontSize: 11, ...mutedText }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Date header bar */}
          <div className="flex items-center gap-3 mb-4 px-4 py-2.5 rounded-[10px]" style={{ background: 'var(--sbas-surface)', boxShadow: 'var(--sbas-shadow-ring)' }}>
            <CalendarDays size={14} style={{ color: 'var(--sbas-primary)', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sbas-text)' }}>
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
            </span>
            <span className="ml-auto text-xs" style={{ color: 'var(--sbas-text-muted)', fontFamily: 'DM Mono,monospace', flexShrink: 0 }}>
              {selectedArticles.length > 0 ? `${selectedArticles.length}件` : '記事なし'}
            </span>
          </div>

          {/* Empty state — dotted well */}
          {selectedArticles.length === 0 && (
            <div className="rounded-[10px] p-12 flex flex-col items-center gap-3 text-center mb-4" style={{ background: 'var(--sbas-surface-muted)', border: '1.5px dashed rgba(14,116,144,0.28)' }}>
              <FileText size={28} style={{ color: 'rgba(14,116,144,0.22)' }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, ...mutedText }}>この日に予定された記事はありません</p>
                <p style={{ fontSize: 12, marginTop: 4, color: 'rgba(102,112,133,0.7)' }}>「保存済み記事一覧」から記事を選び、投稿日を設定してください</p>
              </div>
              <button
                onClick={() => router.push('/articles')}
                className="sbas-btn-press mt-1 px-5 py-2 rounded-lg text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sbas-primary)]"
                style={{ background: 'var(--sbas-primary)' }}
              >
                記事一覧へ
              </button>
            </div>
          )}

          {/* Article cards */}
          <div className="space-y-3">
            {selectedArticles.map(article => {
              const st = article.status === 'published'
                ? { label: '投稿済み', color: 'var(--sbas-neutral)', bg: 'var(--sbas-surface-muted)' }
                : article.status === 'ready'
                  ? { label: '投稿準備完了', color: 'var(--sbas-success)', bg: '#f0fdf4' }
                  : { label: '下書き', color: 'var(--sbas-warning)', bg: '#fffbeb' }
              const scheduleStage = getScheduleStage(article)

              return (
                <div key={article.id} className="rounded-[10px] p-5" style={{ background: 'var(--sbas-surface)', boxShadow: 'var(--sbas-shadow-row)' }}>
                  {/* Stage badge */}
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', ...mutedText }}>スケジュール段階</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-medium" style={{ color: scheduleStage.color, background: scheduleStage.bg }}>{scheduleStage.label}</span>
                  </div>

                  <div className="flex items-start gap-4">
                    {/* Thumbnail */}
                    {article.imageUrl ? (
                      <img src={article.imageUrl} alt="" className="rounded-lg object-cover flex-shrink-0" style={{ width: 72, height: 50 }} />
                    ) : (
                      <div className="rounded-lg flex-shrink-0 flex items-center justify-center" style={{ width: 72, height: 50, background: 'var(--sbas-surface-muted)', border: '1px solid var(--sbas-border)' }}>
                        <FileText size={16} style={{ color: 'var(--sbas-border)' }} />
                      </div>
                    )}

                    {/* Article meta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ color: st.color, background: st.bg }}>{st.label}</span>
                        {article.targetKeyword && (
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: 'var(--sbas-primary)', background: 'var(--sbas-primary-soft)', fontFamily: 'DM Mono,monospace' }}>
                            KW: {article.targetKeyword}
                          </span>
                        )}
                      </div>
                      <h3 style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4, color: 'var(--sbas-text)' }}>
                        {article.refinedTitle || article.title}
                      </h3>
                      <p style={{ fontSize: 11, marginTop: 4, ...mutedText, fontFamily: 'DM Mono,monospace', fontVariantNumeric: 'tabular-nums' }}>
                        {article.wordCount?.toLocaleString() ?? 0}文字
                      </p>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      {article.status !== 'published' && (
                        <button
                          onClick={() => router.push(`/editor?articleId=${article.id}&step=5`)}
                          className="sbas-btn-press flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                          style={{ background: '#dc2626' }}
                        >
                          <Send size={11} />投稿する
                        </button>
                      )}
                      <button
                        onClick={() => router.push(`/editor?articleId=${article.id}&step=1`)}
                        className="sbas-btn-press flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sbas-primary)]"
                        style={{ background: 'var(--sbas-surface-muted)', border: '1px solid var(--sbas-border)', ...mutedText }}
                      >
                        <Pencil size={11} />編集する
                      </button>
                      <button
                        onClick={() => setDeleteTargetId(article.id)}
                        className="sbas-btn-press flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                        style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}
                      >
                        <Trash2 size={11} />削除
                      </button>
                    </div>
                  </div>

                  {/* Controls: date / time / slug */}
                  <div className="mt-4 pt-3 space-y-3" style={{ borderTop: '1px solid var(--sbas-border)' }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span style={{ fontSize: 12, ...mutedText }}>投稿予定日を変更：</span>
                      <input
                        type="date"
                        value={article.scheduledDate ?? ''}
                        onChange={e => { handleScheduleChange(article.id, e.target.value); setSelectedDate(e.target.value) }}
                        className="text-xs px-2 py-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sbas-primary)]"
                        style={{ ...controlBase, borderRadius: 'var(--sbas-radius-control)' }}
                      />
                      <Clock size={13} style={{ ...mutedText, marginLeft: 2 }} />
                      <input
                        type="time"
                        step={900}
                        value={article.scheduledTime ?? ''}
                        onChange={e => handleTimeChange(article.id, e.target.value)}
                        title="15分刻み（00・15・30・45分）"
                        aria-label="投稿予定時刻（15分刻み）"
                        className="text-xs px-2 py-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sbas-primary)]"
                        style={{ ...controlBase, borderRadius: 'var(--sbas-radius-control)' }}
                      />
                      <span style={{ fontSize: 10, ...mutedText, whiteSpace: 'nowrap' }}>15分単位</span>
                    </div>

                    {(() => {
                      const autoSlug = article.slug || ''
                      const isCustom = customSlugIds.has(article.id)
                      return (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <span style={{ fontSize: 12, ...mutedText }}>スラッグ：</span>
                            <select
                              value={isCustom ? 'custom' : 'auto'}
                              onChange={e => {
                                if (e.target.value === 'auto') {
                                  setCustomSlugIds(prev => { const next = new Set(prev); next.delete(article.id); return next })
                                  handleSlugChange(article.id, autoSlug)
                                } else {
                                  setCustomSlugIds(prev => new Set(prev).add(article.id))
                                }
                              }}
                              className="text-xs px-2 py-1 rounded-lg flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sbas-primary)]"
                              style={{ ...controlBase, borderRadius: 'var(--sbas-radius-control)' }}
                            >
                              <option value="auto">{autoSlug || '(スラッグ未設定)'}</option>
                              <option value="custom">自分で入力</option>
                            </select>
                          </div>
                          {isCustom && (
                            <input
                              type="text"
                              value={article.slug ?? ''}
                              onChange={e => handleSlugChange(article.id, e.target.value)}
                              className="text-xs px-2 py-1 rounded-lg w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sbas-primary)]"
                              style={{ ...controlBase, borderRadius: 'var(--sbas-radius-control)' }}
                              placeholder="例: smartboarding-lms-onboarding-guide（半角英数字とハイフン）"
                            />
                          )}
                        </div>
                      )
                    })()}

                    {article.status !== 'published' && article.scheduledDate && article.scheduledTime && (
                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          onClick={() => handleScheduledPublish(article)}
                          disabled={publishingId === article.id}
                          className="sbas-btn-press flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sbas-primary)]"
                          style={{ background: 'var(--sbas-primary)' }}
                        >
                          {publishingId === article.id ? (<><Loader2 size={11} className="animate-spin" />予約投稿中...</>) : (<><Clock size={11} />予約投稿する</>)}
                        </button>
                        <span style={{ fontSize: 12, ...mutedText }}>{article.scheduledTime} に自動公開されます</span>
                      </div>
                    )}

                    {publishResult?.articleId === article.id && (
                      <div className="text-xs px-3 py-2 rounded-lg" style={{
                        background: publishResult.success ? '#f0fdf4' : '#fef2f2',
                        color: publishResult.success ? 'var(--sbas-success)' : '#dc2626',
                        border: `1px solid ${publishResult.success ? '#bbf7d0' : '#fecaca'}`,
                      }}>
                        {publishResult.message}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Unscheduled articles section */}
          {(() => {
            const unscheduled = articles.filter(a => !a.scheduledDate && a.status !== 'published')
            if (unscheduled.length === 0) return null
            return (
              <div className="mt-7">
                <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', ...mutedText, marginBottom: 10, fontFamily: 'DM Mono,monospace' }}>
                  投稿日未設定の記事 ({unscheduled.length}件)
                </p>
                <div className="space-y-2">
                  {unscheduled.map(article => (
                    <div
                      key={article.id}
                      className="sbas-row-hover rounded-[10px] px-4 py-3 flex items-center gap-3"
                      style={{ background: 'var(--sbas-surface)', boxShadow: 'var(--sbas-shadow-ring)' }}
                    >
                      <FileText size={13} style={{ color: 'var(--sbas-border)', flexShrink: 0 }} />
                      <span className="flex-1 text-sm truncate" style={mutedText} title={article.refinedTitle || article.title}>
                        {article.refinedTitle || article.title}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span style={{ fontSize: 11, ...mutedText, whiteSpace: 'nowrap' }}>この日に設定：</span>
                        <button
                          onClick={() => handleScheduleChange(article.id, selectedDate)}
                          className="sbas-btn-press text-xs px-3 py-1.5 rounded-lg font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sbas-primary)]"
                          style={{ background: 'var(--sbas-primary-soft)', color: 'var(--sbas-primary)', border: '1px solid rgba(8,145,178,0.2)' }}
                        >
                          {new Date(selectedDate + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })} に追加
                        </button>
                        <button
                          onClick={() => setDeleteUnscheduledId(article.id)}
                          aria-label="この記事を削除"
                          title="この記事を削除"
                          className="sbas-btn-press p-1.5 rounded-lg hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                          style={{ color: 'var(--sbas-border)', border: '1px solid var(--sbas-border)' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
