'use client'

import { useEffect, useState } from 'react'
import { ArticleData, ProcessingState, Step } from '@/lib/types'
import StepIndicator from './StepIndicator'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { ArrowLeft, CheckCircle, ExternalLink, FileText, Image as ImageIcon, Type, Link as LinkIcon, Tag } from 'lucide-react'
import { maAdvisorDateFallbackSlug, resolveCanonicalPostSlug } from '@/lib/slugNormalize'
import type { WordPressPublishChoice } from '@/lib/wordpressPublishChoice'
import WordPressTagsField from '@/components/editor/WordPressTagsField'
import {
  getDefaultFutureScheduleInputs,
  isLocalScheduleInFuture,
  snapScheduledTimeToQuarterHour,
} from '@/lib/scheduledTimeQuarterHour'

/** 投稿URLスラッグの固定先頭（続きは本文ベースで生成・編集） */
const SLUG_PREFIX = 'smartboarding-'

const SCHEDULE_HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const SCHEDULE_MINUTES_QUARTER = ['00', '15', '30', '45'] as const

function splitScheduleTimeToHm(timeHm: string): { h: string; m: string } {
  const s = snapScheduledTimeToQuarterHour(timeHm.trim() || '09:00')
  const [h, m] = s.split(':')
  return { h: h ?? '09', m: m ?? '00' }
}

interface PublishResultProps {
  article: ArticleData
  wordpressStatus: ProcessingState
  wordpressError?: string | null
  onBack: () => void
  onSaveDraft: () => Promise<string | undefined> | void
  onPublish: (choice: WordPressPublishChoice) => void
  onReset: () => void
  onStepClick?: (step: Step) => void
  onRefinedTitleChange?: (title: string) => void
  onRefinedContentChange?: (content: string) => void
  wordpressTagsInput?: string
  onWordpressTagsInputChange?: (value: string) => void
  slug?: string
  onSlugChange?: (slug: string) => void
  /** 推敲APIが返した英語スラッグ（全体）。ユーザーが空欄にしてもここは上書きしない */
  refineSlugSuggestion?: string
}

export default function PublishResult({
  article,
  wordpressStatus,
  wordpressError = null,
  onBack,
  onSaveDraft,
  onPublish,
  onReset,
  onStepClick,
  onRefinedTitleChange,
  onRefinedContentChange,
  wordpressTagsInput = '',
  onWordpressTagsInputChange,
  slug = '',
  onSlugChange,
  refineSlugSuggestion = '',
}: PublishResultProps) {
  const [wpChoiceOpen, setWpChoiceOpen] = useState(false)
  const [wpScheduleOpen, setWpScheduleOpen] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [scheduleError, setScheduleError] = useState<string | null>(null)

  // Ctrl+A で全選択→削除が効くよう、タイトルをローカル state で保持して即反映する
  const [localTitle, setLocalTitle] = useState(() => article.refinedTitle ?? article.title)
  // 別記事を開いたときだけ親から同期（article.title が変わる＝記事の差し替え）
  useEffect(() => {
    setLocalTitle(article.refinedTitle ?? article.title)
  }, [article.title])

  const handleTitleChange = (value: string) => {
    setLocalTitle(value)
    onRefinedTitleChange?.(value)
  }

  const [slugMode, setSlugMode] = useState<'auto' | 'custom'>('auto')

  const [slugSuffix, setSlugSuffix] = useState(() =>
    slug.startsWith(SLUG_PREFIX) ? slug.slice(SLUG_PREFIX.length) : slug
  )

  const autoFullSlug = resolveCanonicalPostSlug(
    refineSlugSuggestion.trim() ? refineSlugSuggestion : maAdvisorDateFallbackSlug()
  )

  useEffect(() => {
    if (!onSlugChange || slugMode !== 'auto') return
    const next = resolveCanonicalPostSlug(
      refineSlugSuggestion.trim() ? refineSlugSuggestion : maAdvisorDateFallbackSlug()
    )
    onSlugChange(next)
  }, [slugMode, refineSlugSuggestion, onSlugChange])

  useEffect(() => {
    if (slugMode !== 'custom') return
    if (!slug) {
      setSlugSuffix('')
      return
    }
    setSlugSuffix(slug.startsWith(SLUG_PREFIX) ? slug.slice(SLUG_PREFIX.length) : slug)
  }, [slug, slugMode])

  useEffect(() => {
    if (slugMode !== 'custom' || !slug?.trim() || !onSlugChange) return
    if (!slug.startsWith(SLUG_PREFIX)) {
      const migrated = `${SLUG_PREFIX}${slug.replace(/^-+/, '')}`
      if (migrated !== slug) onSlugChange(migrated)
    }
  }, [slug, onSlugChange, slugMode])

  const sanitizeSuffixInput = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')

  const handleSlugSuffixChange = (value: string) => {
    const next = sanitizeSuffixInput(value)
    setSlugSuffix(next)
    onSlugChange?.(next ? `${SLUG_PREFIX}${next}` : '')
  }

  const finalTitle = localTitle.trim() || article.title
  const finalContent = article.refinedContent || ''
  const charCount = finalContent.length
  const previewExcerpt =
    finalContent.replace(/\s+/g, ' ').trim().slice(0, 120) + (finalContent.length > 120 ? '…' : '')

  const scheduleSelectHm = splitScheduleTimeToHm(scheduleTime)

  return (
    <div className="w-full pt-6 pb-12">
      <div className="flex gap-8 items-start">
        {/* 左：メインコンテンツ */}
        <div className="flex-1 min-w-0 flex flex-col gap-5">
          {wordpressStatus === 'success' ? (
            <Card>
              <div className="flex flex-col items-center gap-5 py-6 text-center">
            <div className="w-16 h-16 rounded-full bg-[#16A34A]/10 flex items-center justify-center">
              <CheckCircle size={32} className="text-[#16A34A]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#1A1A2E] mb-1">
                {article.wordpressPostStatus === 'draft'
                  ? 'WordPressに下書き保存しました'
                  : article.wordpressPostStatus === 'future'
                    ? 'WordPressに予約投稿しました'
                    : '記事を投稿しました'}
              </h2>
              <p className="text-sm text-[#64748B]">
                {article.wordpressPostStatus === 'draft'
                  ? 'WordPressの下書きとして保存されています。管理画面から公開できます。'
                  : article.wordpressPostStatus === 'future'
                    ? '指定した日時に公開されるようWordPressへ登録されました。投稿スケジュールからも確認できます。'
                    : 'WordPressに正常に投稿されました'}
              </p>
            </div>

            {article.wordpressUrl && (
              <a
                href={article.wordpressUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="
                  flex items-center gap-2 text-sm text-[#1A9FCC] font-medium
                  hover:underline underline-offset-2
                "
              >
                投稿された記事を確認する
                <ExternalLink size={14} />
              </a>
            )}

            <Button variant="navy" size="lg" onClick={onReset}>
              新しい記事を作成する
            </Button>
          </div>
            </Card>
          ) : (
            <Card>
              <h2 className="text-base font-bold text-[#1A1A2E] mb-4">
                最終確認ページ
              </h2>

              <div className="space-y-4">
                <div className="rounded-xl overflow-hidden border border-[#E2E8F0] bg-white">
                  {article.imageUrl ? (
                    <img
                      src={article.imageUrl}
                      alt="投稿イメージ"
                      className="w-full h-[220px] object-cover"
                    />
                  ) : (
                    <div className="w-full h-[220px] bg-[#F1F5F9] flex items-center justify-center text-[#94A3B8] text-sm">
                      画像未設定
                    </div>
                  )}
                  <div className="px-4 py-3">
                    <p className="text-xs font-mono text-[#16A34A] mb-1">投稿プレビュー</p>
                    <h3 className="text-lg font-bold text-[#1A1A2E] leading-snug">{finalTitle}</h3>
                    <p className="text-sm text-[#64748B] mt-2">{previewExcerpt}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <Type size={16} className="text-[#64748B] mt-0.5 flex-shrink-0" />
                    <div className="w-full">
                      <p className="text-xs font-mono text-[#64748B] mb-0.5">タイトル（最終確認・編集可）</p>
                      <input
                        type="text"
                        value={localTitle}
                        onChange={e => handleTitleChange(e.target.value)}
                        className="
                          w-full px-4 py-2.5 rounded-lg border border-[#E2E8F0]
                          text-sm font-semibold text-[#1A1A2E]
                          focus:outline-none focus:ring-2 focus:ring-[#1A9FCC]/30 focus:border-[#1A9FCC]
                          transition-all
                        "
                        placeholder="記事タイトル"
                      />
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <LinkIcon size={16} className="text-[#64748B] mt-0.5 flex-shrink-0" />
                    <div className="w-full">
                      <p className="text-xs font-mono text-[#64748B] mb-0.5">スラッグ（URL末尾）</p>
                      <p className="text-[11px] text-[#94A3B8] mb-1.5">
                        先頭は固定 <span className="font-mono text-[#64748B]">{SLUG_PREFIX}</span>
                        。「推敲で自動生成」はタイトル・本文に合わせた英語スラッグを使います（略語より small-business など読みやすい表記を優先）。「自分で入力」では内容を自由に指定できます。空のまま投稿しても WordPress 側で日本語化されず、英語スラッグが付与されます。
                      </p>
                      <select
                        value={slugMode}
                        onChange={e => {
                          const mode = e.target.value as 'auto' | 'custom'
                          setSlugMode(mode)
                          if (mode === 'auto' && onSlugChange) {
                            onSlugChange(autoFullSlug)
                          }
                        }}
                        className="w-full mb-2 px-3 py-2 rounded-lg border border-[#E2E8F0] text-sm text-[#1A1A2E] bg-white focus:outline-none focus:ring-2 focus:ring-[#1A9FCC]/30 focus:border-[#1A9FCC]"
                        aria-label="スラッグの決め方"
                      >
                        <option value="auto">
                          推敲で自動生成（推奨）: {autoFullSlug}
                        </option>
                        <option value="custom">自分で入力（半角英数字・ハイフン）</option>
                      </select>
                      {slugMode === 'auto' ? (
                        <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-sm font-mono text-[#1A1A2E] break-all">
                          {autoFullSlug}
                        </div>
                      ) : (
                        <div className="flex w-full items-stretch rounded-lg border border-[#E2E8F0] bg-white overflow-hidden focus-within:ring-2 focus-within:ring-[#1A9FCC]/30 focus-within:border-[#1A9FCC] transition-all">
                          <span
                            className="flex items-center px-3 py-2.5 text-sm font-mono text-[#64748B] bg-[#F1F5F9] border-r border-[#E2E8F0] flex-shrink-0 select-none"
                            aria-hidden
                          >
                            {SLUG_PREFIX}
                          </span>
                          <input
                            type="text"
                            value={slugSuffix}
                            onChange={e => handleSlugSuffixChange(e.target.value)}
                            className="flex-1 min-w-0 px-3 py-2.5 text-sm text-[#1A1A2E] font-mono border-0 focus:outline-none focus:ring-0"
                            placeholder="例: selection-tax-guide"
                            aria-label="スラッグ（smartboarding- の後ろ）"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Tag size={16} className="text-[#64748B] mt-0.5 flex-shrink-0" />
                    <div className="w-full min-w-0">
                      <p className="text-xs font-mono text-[#64748B] mb-1">WordPressタグ</p>
                      <WordPressTagsField
                        value={wordpressTagsInput}
                        onChange={v => onWordpressTagsInputChange?.(v)}
                      />
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <FileText size={16} className="text-[#64748B] mt-0.5 flex-shrink-0" />
                    <div className="w-full">
                      <p className="text-xs font-mono text-[#64748B] mb-0.5">本文（最終確認・編集可）</p>
                      <textarea
                        value={finalContent}
                        onChange={e => onRefinedContentChange?.(e.target.value)}
                        className="
                          w-full rounded-lg border border-[#E2E8F0] bg-white p-3
                          text-sm text-[#1A1A2E] leading-relaxed resize-y
                          min-h-[200px] max-h-[400px]
                          focus:outline-none focus:ring-2 focus:ring-[#1A9FCC]/30 focus:border-[#1A9FCC]
                          transition-all
                        "
                        placeholder="記事本文"
                      />
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <ImageIcon size={16} className="text-[#64748B] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-mono text-[#64748B] mb-0.5">画像</p>
                      <p className="text-sm font-semibold text-[#16A34A] flex items-center gap-1">
                        <CheckCircle size={13} />
                        {article.imageUrl ? '設定済み' : '未設定'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <FileText size={16} className="text-[#64748B] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-mono text-[#64748B] mb-0.5">文字数</p>
                      <p className="text-sm font-semibold text-[#1A1A2E]">{charCount.toLocaleString()}文字</p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* 右：StepIndicator */}
        <div className="flex-shrink-0 w-[140px] pt-2">
          <StepIndicator currentStep={5} onStepClick={onStepClick} />
        </div>
      </div>

      {/* 下：ナビゲーションボタン */}
      {wordpressStatus === 'success' ? (
        <div className="flex items-center justify-end mt-8">
          <Button variant="navy" size="lg" onClick={onReset}>
            新しい記事を作成する
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between mt-8">
          <Button variant="ghost" size="md" onClick={onBack}>
            <ArrowLeft size={16} />
            画像生成に戻る
          </Button>
          {wordpressStatus === 'loading' ? (
            <div className="flex items-center justify-center gap-3 py-3 px-4 rounded-lg bg-white border border-[#E2E8F0]">
              <svg
                className="animate-spin h-5 w-5 text-[#1A9FCC]"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              <span className="text-sm text-[#1A9FCC] font-medium">
                WordPress APIに送信中...
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {wordpressStatus === 'error' && wordpressError && (
                <div
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                  role="alert"
                >
                  <p className="font-medium mb-1">投稿に失敗しました</p>
                  <p className="font-mono text-xs break-all">{wordpressError}</p>
                  <p className="mt-2 text-xs text-red-600">
                    Vercelの環境変数（WORDPRESS_URL / USERNAME / APP_PASSWORD）や、WordPressのアプリパスワード（0とO・スペース）を確認してください。
                  </p>
                </div>
              )}
              <div className="flex items-center gap-3">
                <button
                  onClick={onSaveDraft}
                  className="flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-medium"
                  style={{ background: '#F0F4FF', border: '1.5px solid #C7D7FF', color: '#1A9FCC' }}
                >
                  💾 下書きに保存
                </button>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => setWpChoiceOpen(true)}
                  className="justify-center"
                >
                  <CheckCircle size={18} />
                  WordPressに投稿する
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {wpChoiceOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wp-publish-choice-title"
          onClick={() => setWpChoiceOpen(false)}
        >
          <div
            className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xl max-w-md w-full p-6"
            onClick={e => e.stopPropagation()}
          >
            <h3 id="wp-publish-choice-title" className="text-base font-bold text-[#1A1A2E] mb-2">
              WordPressへ投稿する
            </h3>
            <p className="text-sm text-[#64748B] mb-5">
              下書き・すぐ公開・日時を指定した予約投稿から選べます。
            </p>
            <div className="flex flex-col gap-3">
              <Button
                variant="navy"
                size="lg"
                className="justify-center w-full"
                onClick={() => {
                  setWpChoiceOpen(false)
                  onPublish({ type: 'draft' })
                }}
              >
                下書きとして送信
              </Button>
              <Button
                variant="primary"
                size="lg"
                className="justify-center w-full"
                onClick={() => {
                  setWpChoiceOpen(false)
                  onPublish({ type: 'publish' })
                }}
              >
                すぐ公開する
              </Button>
              <Button
                variant="ghost"
                size="lg"
                className="justify-center w-full !border-[#C7D7FF] !text-[#1A9FCC] bg-[#F0F4FF]"
                onClick={() => {
                  setWpChoiceOpen(false)
                  const init = getDefaultFutureScheduleInputs()
                  setScheduleDate(init.date)
                  setScheduleTime(init.time)
                  setScheduleError(null)
                  setWpScheduleOpen(true)
                }}
              >
                予約投稿する
              </Button>
              <button
                type="button"
                onClick={() => setWpChoiceOpen(false)}
                className="text-sm text-[#64748B] py-2 hover:text-[#1A1A2E] transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {wpScheduleOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wp-schedule-title"
          onClick={() => setWpScheduleOpen(false)}
        >
          <div
            className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xl max-w-md w-full p-6"
            onClick={e => e.stopPropagation()}
          >
            <h3 id="wp-schedule-title" className="text-base font-bold text-[#1A1A2E] mb-2">
              予約投稿の日時を指定
            </h3>
            <p className="text-sm text-[#64748B] mb-4">
              公開予定の日付と時刻を選んでください。時刻は15分刻み（00・15・30・45分）です。
            </p>
            <div className="flex flex-col gap-3 mb-4">
              <label className="block">
                <span className="text-xs font-semibold text-[#64748B] mb-1 block">日付</span>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={e => {
                    setScheduleDate(e.target.value)
                    setScheduleError(null)
                  }}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-[#E2E8F0] text-[#1A1A2E]"
                />
              </label>
              <div className="block">
                <span className="text-xs font-semibold text-[#64748B] mb-1 block">時刻</span>
                <div className="flex items-center gap-2">
                  <select
                    id="wp-schedule-hour"
                    value={scheduleSelectHm.h}
                    onChange={e => {
                      setScheduleTime(`${e.target.value}:${scheduleSelectHm.m}`)
                      setScheduleError(null)
                    }}
                    title="時（0〜23）"
                    aria-label="予約投稿の時"
                    className="flex-1 min-w-0 text-sm px-3 py-2 rounded-lg border border-[#E2E8F0] text-[#1A1A2E] font-mono bg-white"
                  >
                    {SCHEDULE_HOURS.map(hr => (
                      <option key={hr} value={hr}>
                        {hr}
                      </option>
                    ))}
                  </select>
                  <span className="text-sm font-mono text-[#64748B] shrink-0" aria-hidden>
                    :
                  </span>
                  <select
                    id="wp-schedule-minute"
                    value={scheduleSelectHm.m}
                    onChange={e => {
                      setScheduleTime(`${scheduleSelectHm.h}:${e.target.value}`)
                      setScheduleError(null)
                    }}
                    title="分（15分刻み）"
                    aria-label="予約投稿の分（15分刻み：00・15・30・45）"
                    className="flex-1 min-w-0 text-sm px-3 py-2 rounded-lg border border-[#E2E8F0] text-[#1A1A2E] font-mono bg-white"
                  >
                    {SCHEDULE_MINUTES_QUARTER.map(min => (
                      <option key={min} value={min}>
                        {min}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[11px] text-[#94A3B8] mt-1">分は 00・15・30・45 のみ選択できます。</p>
              </div>
            </div>
            {scheduleError && (
              <p className="text-sm text-red-600 mb-3" role="alert">
                {scheduleError}
              </p>
            )}
            <div className="flex flex-col gap-3">
              <Button
                variant="primary"
                size="lg"
                className="justify-center w-full"
                onClick={() => {
                  if (!scheduleDate.trim() || !scheduleTime.trim()) {
                    setScheduleError('日付と時刻を入力してください')
                    return
                  }
                  const t = snapScheduledTimeToQuarterHour(scheduleTime)
                  if (!isLocalScheduleInFuture(scheduleDate, t)) {
                    setScheduleError('現在より後の日時を指定してください')
                    return
                  }
                  setWpScheduleOpen(false)
                  onPublish({ type: 'future', scheduledDateTime: `${scheduleDate.trim()}T${t}:00` })
                }}
              >
                この日時で予約投稿する
              </Button>
              <button
                type="button"
                onClick={() => {
                  setWpScheduleOpen(false)
                  setScheduleError(null)
                }}
                className="text-sm text-[#64748B] py-2 hover:text-[#1A1A2E] transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
