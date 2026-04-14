'use client'

import { useRef, useState, useEffect, ChangeEvent, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArticleData, ProcessingState, Step } from '@/lib/types'
import StepIndicator from './StepIndicator'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { ArrowLeft, ArrowRight, Clock, Download, RefreshCw, Sparkles, Upload } from 'lucide-react'
import { setSessionPreviewImage } from '@/lib/sessionPreviewImage'
import { compositeArticleTitleOnImage } from '@/lib/compositeArticleTitleOnImage'

interface ImageResultProps {
  article: ArticleData
  fireflyStatus: ProcessingState
  /** 画像生成失敗時に表示するAPIエラーメッセージ */
  fireflyError?: string | null
  onBack: () => void
  onSaveDraft: () => Promise<string | undefined> | string | void
  onNext: () => void
  onRegenerate: () => void
  /** 初回の画像生成を開始する（クリックで呼ぶ） */
  onGenerate?: () => void
  /** クライアント画像を選択したときに呼ばれる（imageUrl を上書き） */
  onImageUpload?: (imageUrl: string) => void
  onStepClick?: (step: Step) => void
  /** プレビュー遷移時に「このまま投稿する」でSTEP4へ戻るために使用 */
  articleId?: string | null
}

export default function ImageResult({
  article,
  fireflyStatus,
  fireflyError = null,
  onBack,
  onSaveDraft,
  onNext,
  onRegenerate,
  onGenerate,
  onImageUpload,
  onStepClick,
  articleId = null,
}: ImageResultProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const previewBusyRef = useRef(false)
  const [composited, setComposited] = useState('')
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)

  /** タイトル焼き込みは表示・DL・プレビュー用。下書き/投稿に合成画像を載せる場合は親で imageUrl を更新する必要あり */
  useEffect(() => {
    if (!article.imageUrl || fireflyStatus !== 'success') {
      setComposited('')
      return
    }
    const title = article.refinedTitle?.trim() || article.title || ''
    if (!title) {
      setComposited(article.imageUrl)
      return
    }
    compositeArticleTitleOnImage(article.imageUrl, title).then(setComposited)
  }, [article.imageUrl, article.refinedTitle, article.title, fireflyStatus])

  const handlePreview = useCallback(async () => {
    if (previewBusyRef.current) return
    previewBusyRef.current = true
    setIsPreviewLoading(true)
    try {
      const savedId = await onSaveDraft()
      const finalArticleId = savedId || articleId

      const content = article.refinedContent || article.originalContent || ''
      sessionStorage.setItem('preview_content', content)

      // 合成済み画像を優先。まだ生成中なら compositeArticleTitleOnImage を待つ
      let previewImage = composited || article.imageUrl || null
      if (!composited && article.imageUrl) {
        const title = article.refinedTitle?.trim() || article.title || ''
        if (title) {
          try {
            previewImage = await compositeArticleTitleOnImage(article.imageUrl, title)
          } catch {
            previewImage = article.imageUrl
          }
        }
      }
      await setSessionPreviewImage(previewImage)

      const params = new URLSearchParams({
        title: article.refinedTitle?.trim() || article.title || '',
        category: 'お役立ち情報',
        date: new Date().toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
        }).replace(/\//g, '.'),
      })
      if (finalArticleId) params.set('articleId', finalArticleId)
      router.push(`/preview?${params.toString()}`)
    } catch (e) {
      previewBusyRef.current = false
      setIsPreviewLoading(false)
      const msg = e instanceof Error ? e.message : 'プレビュー画面への遷移に失敗しました'
      alert(msg)
    }
  }, [
    article.refinedContent,
    article.originalContent,
    article.imageUrl,
    article.refinedTitle,
    article.title,
    composited,
    articleId,
    onSaveDraft,
    router,
  ])

  const handleDownload = () => {
    const link = document.createElement('a')
    const finalImage = composited || article.imageUrl
    link.href = finalImage
    const ext = finalImage.startsWith('data:image/png') ? 'png' : 'jpg'
    link.download = `${article.refinedTitle?.trim() || article.title || 'generated-image'}.${ext}`
    link.click()
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!onImageUpload) return
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const base64 = event.target?.result as string
      onImageUpload(base64)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <div className="w-full pt-6 pb-12" aria-busy={isPreviewLoading}>
      <PreviewNavigationOverlay active={isPreviewLoading} />
      {/* 2カラム：左＝メインコンテンツ、右＝StepIndicator */}
      <div className="flex gap-8 items-start">
        {/* 左：メインコンテンツ（可変幅） */}
        <div className="flex-1 min-w-0 flex flex-col gap-5">
          {/* エラー表示 */}
          {fireflyStatus === 'error' && fireflyError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <p className="font-medium">画像生成できませんでした</p>
              <p className="mt-1 break-all">{fireflyError}</p>
            </div>
          )}

          {/* 画像カード：常に3ボタン（アップロード・保存・別の画像を生成）を表示 */}
          <Card>
            <div className="flex flex-col items-center gap-5">
              {/* 未生成：画像を生成するボタン */}
              {!article.imageUrl && (fireflyStatus === 'idle' || fireflyStatus === 'error') && onGenerate && (
                <div className="flex flex-col items-center gap-3 py-4">
                  <p className="text-sm text-[#64748B]">
                    {fireflyStatus === 'error' ? 'もう一度お試しください。' : '記事用の画像を生成します（30秒～1分ほどかかります）'}
                  </p>
                  <Button variant="primary" size="lg" onClick={onGenerate} className="gap-2">
                    <RefreshCw size={18} />
                    画像を生成する
                  </Button>
                </div>
              )}
              {fireflyStatus === 'loading' && <ImageGenerationLoader />}
              {/* 画像があるとき：画像表示（生成中はローダーを優先） */}
              {article.imageUrl && fireflyStatus !== 'loading' && (
                <div className="w-full max-w-[640px] rounded-lg overflow-hidden border border-[#E2E8F0]">
                  <Image
                    key={composited || article.imageUrl}
                    src={composited || article.imageUrl}
                    alt="生成された記事画像"
                    width={1000}
                    height={525}
                    className="w-full h-auto"
                    unoptimized
                  />
                </div>
              )}

              <div
                className={`flex items-center gap-3 flex-wrap justify-center ${fireflyStatus === 'loading' ? 'opacity-50 pointer-events-none' : ''}`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button
                  variant="ghost"
                  size="md"
                  onClick={handleUploadClick}
                  disabled={fireflyStatus === 'loading'}
                >
                  <Upload size={15} />
                  画像をアップロード
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  onClick={handleDownload}
                  disabled={!article.imageUrl || fireflyStatus === 'loading'}
                >
                  <Download size={15} />
                  画像を保存する
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  onClick={onRegenerate}
                  disabled={fireflyStatus === 'loading'}
                >
                  <RefreshCw size={15} />
                  別の画像を生成する
                </Button>
              </div>

              <div
                className={`w-full max-w-[640px] flex items-center justify-between gap-4 pt-2 border-t border-[#E2E8F0] ${isPreviewLoading ? 'opacity-60 pointer-events-none' : ''}`}
              >
                <button
                  type="button"
                  onClick={onSaveDraft}
                  className="flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-medium flex-shrink-0"
                  style={{ background: '#F0F4FF', border: '1.5px solid #C7D7FF', color: '#1A9FCC' }}
                  disabled={isPreviewLoading}
                >
                  💾 下書きに保存
                </button>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handlePreview}
                  disabled={fireflyStatus !== 'success' || !article.imageUrl || isPreviewLoading}
                  className="flex-shrink-0"
                >
                  プレビューへ
                  <ArrowRight size={18} />
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* 右：StepIndicator（固定幅） */}
        <div className="flex-shrink-0 w-[140px] pt-2">
          <StepIndicator currentStep={3} onStepClick={onStepClick} />
        </div>
      </div>

      {/* 下：戻るのみ（ナビはカード内に移動済み） */}
      <div className="flex items-center justify-between mt-8">
        <Button variant="ghost" size="md" onClick={onBack}>
          <ArrowLeft size={16} />
          Gemini推敲に戻る
        </Button>
      </div>
    </div>
  )
}

const PREVIEW_NAV_PHASES = [
  { label: '下書きを保存しています' },
  { label: 'プレビュー用の画像を準備しています' },
] as const

/** プレビューへ遷移中：フルスクリーン風オーバーレイ */
function PreviewNavigationOverlay({ active }: { active: boolean }) {
  const [reduceMotion, setReduceMotion] = useState(false)
  const [phaseIndex, setPhaseIndex] = useState(0)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduceMotion(mq.matches)
    const onChange = () => setReduceMotion(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!active) {
      setPhaseIndex(0)
      setProgress(0)
      return
    }
    setPhaseIndex(0)
    setProgress(6)
    const t = window.setTimeout(() => setPhaseIndex(1), 2800)
    return () => window.clearTimeout(t)
  }, [active])

  useEffect(() => {
    if (!active || reduceMotion) return
    const id = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 96) return 96
        const remaining = 96 - p
        const step = p < 40 ? Math.max(1.2, remaining * 0.06) : Math.max(0.35, remaining * 0.04)
        return p + step
      })
    }, 150)
    return () => window.clearInterval(id)
  }, [active, reduceMotion])

  if (!active) return null

  const ringR = 44
  const c = 2 * Math.PI * ringR
  const dash = Math.round(c * 0.28)
  const spinClass = reduceMotion
    ? ''
    : 'motion-reduce:animate-none animate-[spin_1.35s_linear_infinite]'
  const barWidth = reduceMotion ? 42 : Math.min(progress, 96)

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-slate-900/35 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className="w-full max-w-[420px] rounded-2xl border border-[#E2E8F0] bg-white px-8 py-9 flex flex-col items-center text-center shadow-[0_10px_40px_rgba(15,23,42,0.12),0_2px_12px_rgba(15,23,42,0.06)]"
        style={{
          background: 'linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 52%)',
        }}
      >
        <div className="relative w-[100px] h-[100px] mb-5 flex items-center justify-center">
          <svg
            className={`absolute inset-0 w-[100px] h-[100px] text-[#1A9FCC] ${spinClass}`}
            viewBox="0 0 100 100"
            fill="none"
            aria-hidden
          >
            <circle cx="50" cy="50" r={ringR} stroke="#E2E8F0" strokeWidth="5" fill="none" />
            <circle
              cx="50"
              cy="50"
              r={ringR}
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${dash} ${Math.round(c)}`}
              transform="rotate(-90 50 50)"
            />
          </svg>
          <Sparkles className="relative w-9 h-9 text-[#1A9FCC]" strokeWidth={1.75} aria-hidden />
        </div>

        <h2 className="text-base sm:text-lg font-bold text-[#1A1A2E] leading-snug tracking-tight px-1">
          下書きを保存し、プレビュー画面を生成しています。
        </h2>
        <p className="text-sm text-[#64748B] mt-2 max-w-sm leading-relaxed">
          記事データと画像をまとめて、プレビュー用の画面を開いています。
        </p>

        <p className="mt-5 text-xs sm:text-sm font-medium text-[#1A9FCC] min-h-[1.25rem] transition-opacity duration-300">
          {PREVIEW_NAV_PHASES[phaseIndex]?.label}
        </p>

        <div className="w-full max-w-[260px] h-1.5 rounded-full bg-[#E2E8F0] overflow-hidden mt-4">
          <div
            className={`h-full rounded-full bg-[#1A9FCC] ${reduceMotion ? '' : 'transition-[width] duration-200 ease-out'}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>
    </div>
  )
}

/** 画像生成 API 待ち：円形リング + Sparkle・コピー（モダンカード） */
function ImageGenerationLoader() {
  const ringR = 44
  const c = 2 * Math.PI * ringR
  const dash = Math.round(c * 0.28)

  return (
    <div className="w-full max-w-[640px] flex flex-col gap-4" role="status" aria-live="polite">
      <div
        className="w-full rounded-2xl border border-[#E2E8F0] bg-white px-8 py-10 flex flex-col items-center text-center"
        style={{ boxShadow: '0 10px 40px rgba(15, 23, 42, 0.08), 0 2px 12px rgba(15, 23, 42, 0.04)' }}
      >
        <div className="relative w-[100px] h-[100px] mb-6 flex items-center justify-center">
          <svg
            className="absolute inset-0 w-[100px] h-[100px] text-[#1A9FCC] motion-reduce:animate-none animate-[spin_1.35s_linear_infinite]"
            viewBox="0 0 100 100"
            fill="none"
            aria-hidden
          >
            <circle
              cx="50"
              cy="50"
              r={ringR}
              stroke="#E2E8F0"
              strokeWidth="5"
              fill="none"
            />
            <circle
              cx="50"
              cy="50"
              r={ringR}
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${dash} ${Math.round(c)}`}
              transform="rotate(-90 50 50)"
            />
          </svg>
          <Sparkles className="relative w-9 h-9 text-[#1A9FCC]" strokeWidth={1.75} aria-hidden />
        </div>

        <h2 className="text-lg sm:text-xl font-bold text-[#1A1A2E] leading-snug tracking-tight">
          記事に最適なイメージを構築中
        </h2>
        <p className="text-sm text-[#64748B] mt-2 max-w-md leading-relaxed">
          AIが文脈に合わせたビジュアルを生成しています
        </p>
        <p className="mt-5 flex items-center justify-center gap-2 text-xs sm:text-sm text-[#64748B]">
          <Clock className="w-4 h-4 flex-shrink-0 text-[#1A9FCC]/70" aria-hidden />
          <span>約30秒〜1分で完了することが多いです</span>
        </p>
      </div>

      <div
        className="rounded-xl border border-sky-100 bg-sky-50/80 px-4 py-3 flex gap-3 text-left"
        style={{ boxShadow: '0 1px 3px rgba(14, 116, 144, 0.06)' }}
      >
        <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
          <span className="font-semibold text-[#0C4A6E]">Tips: </span>
          高品質な画像は読了率の向上に効くことがあります。AIは記事本文の内容を踏まえて画像を生成しています。
        </p>
      </div>
    </div>
  )
}
