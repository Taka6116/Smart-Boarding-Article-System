'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { SavedArticle } from '@/lib/types'
import { resolveCanonicalPostSlug } from '@/lib/slugNormalize'
import { getAllArticles, saveArticle } from '@/lib/articleStorage'
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

/** カレンダー／一覧／カード共通の「投稿スケジュール段階」 */
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

/** 予定日時が「いま」より後か（過去の予約・送信済みは一覧から除外） */
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
    if (month === 0) {
      setYear(y => y - 1)
      setMonth(11)
    } else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 11) {
      setYear(y => y + 1)
      setMonth(0)
    } else setMonth(m => m + 1)
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
    if (a) {
      a.scheduledDate = date
      await saveArticle(a)
      setArticles(await getAllArticles())
    }
  }

  const handleTimeChange = async (articleId: string, time: string) => {
    const normalized = snapScheduledTimeToQuarterHour(time)
    const all = await getAllArticles()
    const a = all.find(x => x.id === articleId)
    if (a) {
      a.scheduledTime = normalized
      await saveArticle(a)
      setArticles(await getAllArticles())
    }
  }

  const handleSlugChange = async (articleId: string, newSlug: string) => {
    const all = await getAllArticles()
    const a = all.find(x => x.id === articleId)
    if (a) {
      a.slug = newSlug
      await saveArticle(a)
      setArticles(await getAllArticles())
    }
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
          if (typeof data.status === 'string' && data.status) {
            a.wordpressPostStatus = data.status
          }
          if (typeof data.dateGmt === 'string' && data.dateGmt.trim()) {
            a.wordpressPublishedAt = data.dateGmt.trim()
          }
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

  if (!mounted) return null

  return (
    <div className="w-full pt-6 pb-12 px-2">
      {deleteTargetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div
            className="w-full max-w-sm rounded-xl p-5"
            style={{ background: 'white', border: '1px solid #E2E8F0' }}
          >
            <p className="text-sm font-semibold mb-4" style={{ color: '#1A1A2E' }}>
              本当に削除しますか？
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={handleDeleteConfirmed}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ background: '#DC2626' }}
              >
                はい
              </button>
              <button
                onClick={() => setDeleteTargetId(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#64748B' }}
              >
                いいえ
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-xl font-bold" style={{ color: '#1A1A2E' }}>
          投稿スケジュール
        </h1>
        <p className="text-sm mt-1" style={{ color: '#64748B' }}>
          記事の投稿予定日を設定・管理できます
        </p>
      </div>

      <div
        className="rounded-xl mb-5 overflow-hidden"
        style={{
          background: 'white',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
          style={{ borderBottom: '1px solid #F1F5F9' }}
        >
          <div className="flex items-center gap-2">
            <List size={18} style={{ color: '#1A9FCC' }} />
            <h2 className="text-sm font-bold" style={{ color: '#1A1A2E' }}>
              予定一覧（これから投稿する予定・日時が未来の記事）
            </h2>
          </div>
          <label
            className="flex items-center gap-2 text-xs cursor-pointer select-none"
            style={{ color: '#64748B' }}
          >
            <input
              type="checkbox"
              checked={scheduleListThisMonthOnly}
              onChange={e => setScheduleListThisMonthOnly(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span>
              {year}年{MONTH_NAMES[month]}のみ表示
            </span>
          </label>
        </div>
        {scheduleTableRows.length === 0 ? (
          <p className="text-xs px-5 py-6 text-center" style={{ color: '#94A3B8' }}>
            {scheduleListThisMonthOnly
              ? 'この月に、今後投稿予定の記事はありません'
              : '今後投稿予定の記事はありません（過去の予定は表示しません）'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr style={{ background: '#F8FAFC', color: '#64748B' }}>
                  <th className="px-4 py-2.5 font-semibold whitespace-nowrap">予定日</th>
                  <th className="px-4 py-2.5 font-semibold whitespace-nowrap">時刻</th>
                  <th className="px-4 py-2.5 font-semibold min-w-[12rem]">タイトル</th>
                  <th className="px-4 py-2.5 font-semibold min-w-[7rem]">KW</th>
                  <th className="px-4 py-2.5 font-semibold min-w-[10rem]">タグ</th>
                  <th className="px-4 py-2.5 font-semibold whitespace-nowrap">スケジュール段階</th>
                  <th className="px-4 py-2.5 font-semibold whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody>
                {scheduleTableRows.map(article => {
                  const stage = getScheduleStage(article)
                  const title = article.refinedTitle || article.title
                  return (
                    <tr key={article.id} style={{ borderTop: '1px solid #F1F5F9', color: '#334155' }}>
                      <td className="px-4 py-2.5 font-mono whitespace-nowrap align-top">
                        {article.scheduledDate}
                      </td>
                      <td className="px-4 py-2.5 font-mono whitespace-nowrap align-top">
                        {article.scheduledTime?.trim() ? article.scheduledTime : '—'}
                      </td>
                      <td className="px-4 py-2.5 align-top max-w-[20rem]">
                        <div className="line-clamp-2" title={title}>
                          {title}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 align-top text-[#64748B] max-w-[10rem] truncate" title={article.targetKeyword}>
                        {article.targetKeyword || '—'}
                      </td>
                      <td
                        className="px-4 py-2.5 align-top max-w-[14rem]"
                        title={
                          article.wordpressTags?.length
                            ? article.wordpressTags.join('、')
                            : undefined
                        }
                      >
                        {article.wordpressTags && article.wordpressTags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {article.wordpressTags.map((tag, i) => (
                              <span
                                key={`${article.id}-tag-${i}-${tag}`}
                                className="text-[10px] px-1.5 py-0.5 rounded-md max-w-[8rem] truncate inline-block align-middle"
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
                          <span className="text-[#94A3B8]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 align-top whitespace-nowrap">
                        <span
                          className="inline-block px-2 py-0.5 rounded-full font-medium"
                          style={{ color: stage.color, background: stage.bg, fontFamily: 'DM Mono' }}
                        >
                          {stage.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 align-top whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            if (article.scheduledDate) setSelectedDate(article.scheduledDate)
                            setYear(parseInt(article.scheduledDate!.slice(0, 4), 10))
                            setMonth(parseInt(article.scheduledDate!.slice(5, 7), 10) - 1)
                          }}
                          className="text-xs font-semibold px-2 py-1 rounded-lg"
                          style={{ color: '#1A9FCC', background: '#F0F4FF', border: '1px solid #C7D7FF' }}
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

      <div className="flex gap-5 items-start">
        <div
          className="flex-shrink-0 rounded-2xl p-5"
          style={{
            width: '360px',
            background: 'white',
            border: '1px solid #E2E8F0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition-all">
              <ChevronLeft size={16} style={{ color: '#64748B' }} />
            </button>
            <span className="font-bold text-base" style={{ color: '#1A1A2E' }}>
              {year}年 {MONTH_NAMES[month]}
            </span>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition-all">
              <ChevronRight size={16} style={{ color: '#64748B' }} />
            </button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                className="text-center text-xs py-1 font-medium"
                style={{ color: i === 0 ? '#EF4444' : i === 6 ? '#3B82F6' : '#94A3B8' }}
              >
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-1">
            {calendarCells.map((day, idx) => {
              if (!day) return <div key={idx} />

              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const isToday = dateStr === toYMD(today)
              const isSelected = dateStr === selectedDate
              const dayArticles = articlesByDate[dateStr] ?? []
              const hasPublished = dayArticles.some(a => a.status === 'published')
              const hasReady = dayArticles.some(a => a.status === 'ready')
              const hasDraft = dayArticles.some(a => a.status === 'draft')
              const dotColor = hasPublished ? '#64748B' : hasReady ? '#16A34A' : hasDraft ? '#F59E0B' : null
              const dow = (firstDayOfWeek + day - 1) % 7

              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDate(dateStr)}
                  className="flex flex-col items-center justify-center rounded-xl py-1.5 transition-all"
                  style={{
                    background: isSelected ? '#1A9FCC' : isToday ? '#FDF0EE' : 'transparent',
                    border: isToday && !isSelected ? '1.5px solid #C0392B' : '1.5px solid transparent',
                  }}
                >
                  <span
                    className="text-sm font-medium"
                    style={{
                      color: isSelected
                        ? 'white'
                        : isToday
                          ? '#C0392B'
                          : dow === 0
                            ? '#EF4444'
                            : dow === 6
                              ? '#3B82F6'
                              : '#1A1A2E',
                    }}
                  >
                    {day}
                  </span>
                  {dotColor && (
                    <div
                      className="w-1.5 h-1.5 rounded-full mt-0.5"
                      style={{ background: isSelected ? 'rgba(255,255,255,0.7)' : dotColor }}
                    />
                  )}
                </button>
              )
            })}
          </div>

          <div className="mt-4 pt-4 space-y-2" style={{ borderTop: '1px solid #F1F5F9' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>
              記事の編集状態（ドット）
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {[
                { color: '#16A34A', label: '投稿準備完了' },
                { color: '#F59E0B', label: '下書き' },
                { color: '#64748B', label: '投稿済み' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <span className="text-xs" style={{ color: '#94A3B8' }}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div
            className="rounded-xl px-5 py-3 mb-4 flex items-center gap-3"
            style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}
          >
            <CalendarDays size={16} style={{ color: '#1A9FCC' }} />
            <span className="font-semibold text-sm" style={{ color: '#1A1A2E' }}>
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'short',
              })}
            </span>
            <span className="text-xs ml-auto" style={{ color: '#94A3B8', fontFamily: 'DM Mono' }}>
              {selectedArticles.length > 0 ? `${selectedArticles.length}件の記事` : '記事なし'}
            </span>
          </div>

          {selectedArticles.length === 0 && (
            <div
              className="rounded-xl p-12 flex flex-col items-center gap-3 text-center"
              style={{ background: 'white', border: '1px solid #E2E8F0', borderStyle: 'dashed' }}
            >
              <FileText size={32} style={{ color: '#E2E8F0' }} />
              <div>
                <p className="text-sm font-medium" style={{ color: '#94A3B8' }}>
                  この日に予定された記事はありません
                </p>
                <p className="text-xs mt-1" style={{ color: '#CBD5E1' }}>
                  「過去記事一覧」から記事を選び、投稿日を設定してください
                </p>
              </div>
              <button
                onClick={() => router.push('/articles')}
                className="mt-1 px-5 py-2 rounded-lg text-xs font-semibold text-white"
                style={{ background: '#1A9FCC' }}
              >
                記事一覧へ
              </button>
            </div>
          )}

          <div className="space-y-3">
            {selectedArticles.map(article => {
              const st =
                article.status === 'published'
                  ? { label: '投稿済み', color: '#64748B', bg: '#F8FAFC' }
                  : article.status === 'ready'
                    ? { label: '投稿準備完了', color: '#16A34A', bg: '#F0FDF4' }
                    : { label: '下書き', color: '#F59E0B', bg: '#FFFBEB' }
              const scheduleStage = getScheduleStage(article)

              return (
                <div
                  key={article.id}
                  className="rounded-xl p-5"
                  style={{
                    background: 'white',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>
                      スケジュール段階
                    </span>
                    <span
                      className="text-xs px-2.5 py-1 rounded-full font-semibold"
                      style={{
                        color: scheduleStage.color,
                        background: scheduleStage.bg,
                        fontFamily: 'DM Mono',
                      }}
                    >
                      {scheduleStage.label}
                    </span>
                  </div>
                  <div className="flex items-start gap-4">
                    {article.imageUrl ? (
                      <img
                        src={article.imageUrl}
                        alt=""
                        className="rounded-lg object-cover flex-shrink-0"
                        style={{ width: 72, height: 50 }}
                      />
                    ) : (
                      <div
                        className="rounded-lg flex-shrink-0 flex items-center justify-center"
                        style={{ width: 72, height: 50, background: '#F1F5F9' }}
                      >
                        <FileText size={18} style={{ color: '#CBD5E1' }} />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-[10px] font-medium" style={{ color: '#94A3B8' }}>
                          記事状態
                        </span>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ color: st.color, background: st.bg, fontFamily: 'DM Mono' }}
                        >
                          {st.label}
                        </span>
                        {article.targetKeyword && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{
                              color: '#1A9FCC',
                              background: '#F0F4FF',
                              border: '1px solid #C7D7FF',
                              fontFamily: 'DM Mono',
                            }}
                          >
                            KW: {article.targetKeyword}
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-sm leading-snug" style={{ color: '#1A1A2E' }}>
                        {article.refinedTitle || article.title}
                      </h3>
                      <p className="text-xs mt-1" style={{ color: '#94A3B8', fontFamily: 'DM Mono' }}>
                        {article.wordCount?.toLocaleString() ?? 0}文字
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 flex-shrink-0">
                      {article.status !== 'published' && (
                        <button
                          onClick={() => router.push(`/editor?articleId=${article.id}&step=5`)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white"
                          style={{ background: '#C0392B', boxShadow: '0 2px 6px rgba(192,57,43,0.2)' }}
                        >
                          <Send size={12} />
                          投稿する
                        </button>
                      )}
                      <button
                        onClick={() => router.push(`/editor?articleId=${article.id}&step=1`)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium"
                        style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#64748B' }}
                      >
                        <Pencil size={12} />
                        編集する
                      </button>
                      <button
                        onClick={() => setDeleteTargetId(article.id)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium"
                        style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' }}
                      >
                        <Trash2 size={12} />
                        削除
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 space-y-3" style={{ borderTop: '1px solid #F1F5F9' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: '#94A3B8' }}>
                        投稿予定日を変更：
                      </span>
                      <input
                        type="date"
                        value={article.scheduledDate ?? ''}
                        onChange={e => {
                          handleScheduleChange(article.id, e.target.value)
                          setSelectedDate(e.target.value)
                        }}
                        className="text-xs px-2 py-1 rounded-md border"
                        style={{
                          border: '1px solid #E2E8F0',
                          color: '#64748B',
                          fontFamily: 'DM Mono',
                          background: '#FAFBFC',
                        }}
                      />
                      <Clock size={14} style={{ color: '#94A3B8', marginLeft: 4 }} />
                      <input
                        type="time"
                        step={900}
                        value={article.scheduledTime ?? ''}
                        onChange={e => handleTimeChange(article.id, e.target.value)}
                        title="15分刻み（00・15・30・45分）"
                        aria-label="投稿予定時刻（15分刻み）"
                        className="text-xs px-2 py-1 rounded-md border"
                        style={{
                          border: '1px solid #E2E8F0',
                          color: '#64748B',
                          fontFamily: 'DM Mono',
                          background: '#FAFBFC',
                        }}
                      />
                      <span className="text-[10px] text-[#94A3B8] whitespace-nowrap">
                        15分単位
                      </span>
                    </div>

                    {(() => {
                      const autoSlug = article.slug || ''
                      const isCustom = customSlugIds.has(article.id)
                      return (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs" style={{ color: '#94A3B8' }}>
                              スラッグ：
                            </span>
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
                              className="text-xs px-2 py-1 rounded-md border flex-1"
                              style={{
                                border: '1px solid #E2E8F0',
                                color: '#64748B',
                                fontFamily: 'DM Mono',
                                background: '#FAFBFC',
                              }}
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
                              className="text-xs px-2 py-1 rounded-md border w-full"
                              style={{
                                border: '1px solid #E2E8F0',
                                color: '#64748B',
                                fontFamily: 'DM Mono',
                                background: '#FAFBFC',
                              }}
                              placeholder="例: smartboarding-lms-onboarding-guide（半角英数字とハイフン）"
                            />
                          )}
                        </div>
                      )
                    })()}

                    {article.status !== 'published' && article.scheduledDate && article.scheduledTime && (
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleScheduledPublish(article)}
                          disabled={publishingId === article.id}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                          style={{ background: '#1A9FCC', boxShadow: '0 2px 6px rgba(27,42,74,0.2)' }}
                        >
                          {publishingId === article.id ? (
                            <>
                              <Loader2 size={12} className="animate-spin" />
                              予約投稿中...
                            </>
                          ) : (
                            <>
                              <Clock size={12} />
                              予約投稿する
                            </>
                          )}
                        </button>
                        <span className="text-xs" style={{ color: '#94A3B8' }}>
                          {article.scheduledTime} に自動公開されます
                        </span>
                      </div>
                    )}

                    {publishResult?.articleId === article.id && (
                      <div
                        className="text-xs px-3 py-2 rounded-lg"
                        style={{
                          background: publishResult.success ? '#F0FDF4' : '#FEF2F2',
                          color: publishResult.success ? '#16A34A' : '#DC2626',
                          border: `1px solid ${publishResult.success ? '#BBF7D0' : '#FECACA'}`,
                        }}
                      >
                        {publishResult.message}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {(() => {
            const unscheduled = articles.filter(a => !a.scheduledDate && a.status !== 'published')
            if (unscheduled.length === 0) return null
            return (
              <div className="mt-6">
                <p
                  className="text-xs font-semibold mb-3"
                  style={{ color: '#94A3B8', letterSpacing: '0.08em', fontFamily: 'DM Mono' }}
                >
                  投稿日未設定の記事 ({unscheduled.length}件)
                </p>
                <div className="space-y-2">
                  {unscheduled.map(article => (
                    <div
                      key={article.id}
                      className="rounded-xl px-4 py-3 flex items-center gap-3"
                      style={{ background: 'white', border: '1px solid #E2E8F0' }}
                    >
                      <FileText size={14} style={{ color: '#CBD5E1', flexShrink: 0 }} />
                      <span className="flex-1 text-sm truncate" style={{ color: '#64748B' }}>
                        {article.refinedTitle || article.title}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs" style={{ color: '#94A3B8' }}>
                          この日に設定：
                        </span>
                        <button
                          onClick={() => {
                            handleScheduleChange(article.id, selectedDate)
                          }}
                          className="text-xs px-3 py-1 rounded-lg font-medium"
                          style={{ background: '#F0F4FF', color: '#1A9FCC', border: '1px solid #C7D7FF' }}
                        >
                          {new Date(selectedDate + 'T00:00:00').toLocaleDateString('ja-JP', {
                            month: 'short',
                            day: 'numeric',
                          })}{' '}
                          に追加
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
