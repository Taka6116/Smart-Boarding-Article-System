'use client'

import { useRef, useState, useEffect, ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArticleData, ProcessingState, Step } from '@/lib/types'
import StepIndicator from './StepIndicator'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { ArrowLeft, ArrowRight, Clock, Download, RefreshCw, Sparkles, Upload } from 'lucide-react'
import { setSessionPreviewImage } from '@/lib/sessionPreviewImage'

async function compositeTextOnImage(imageDataUrl: string, titleText: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = () => {
      const W = img.naturalWidth || 1280
      const H = img.naturalHeight || 720
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, W, H)

      const gradH = H * 0.58
      const grad = ctx.createLinearGradient(0, H - gradH, 0, H)
      grad.addColorStop(0, 'rgba(0,0,0,0)')
      grad.addColorStop(1, 'rgba(0,0,0,0.74)')
      ctx.fillStyle = grad
      ctx.fillRect(0, H - gradH, W, gradH)

      const pad = W * 0.06
      const maxW = W - pad * 2
      const fontSize = Math.round(W * 0.036)
      ctx.font = `bold ${fontSize}px "Noto Sans JP","Hiragino Sans","Yu Gothic",sans-serif`
      ctx.fillStyle = '#FFFFFF'
      ctx.shadowColor = 'rgba(0,0,0,0.55)'
      ctx.shadowBlur = 10

      const chars = [...titleText]
      const lines: string[] = []
      let cur = ''
      for (const ch of chars) {
        if (ctx.measureText(cur + ch).width > maxW && cur) {
          lines.push(cur)
          cur = ch
          if (lines.length >= 3) break
        } else {
          cur += ch
        }
      }
      if (cur && lines.length < 4) lines.push(cur)

      const lh = fontSize * 1.42
      const totalH = lines.length * lh
      const startY = H - pad - totalH + fontSize

      lines.forEach((line, i) => {
        ctx.fillText(line, pad, startY + i * lh)
      })

      resolve(canvas.toDataURL('image/jpeg', 0.92))
    }
    img.onerror = () => resolve(imageDataUrl)
    img.crossOrigin = 'anonymous'
    img.src = imageDataUrl
  })
}

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
  const [composited, setComposited] = useState('')

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
    compositeTextOnImage(article.imageUrl, title).then(setComposited)
  }, [article.imageUrl, article.refinedTitle, article.title, fireflyStatus])

  const handlePreview = async () => {
    const savedId = await onSaveDraft()
    const finalArticleId = savedId || articleId

    const content = article.refinedContent || article.originalContent || ''
    sessionStorage.setItem('preview_content', content)

    // 合成済み画像を優先。まだ生成中なら compositeTextOnImage を待つ
    let previewImage = composited || article.imageUrl || null
    if (!composited && article.imageUrl) {
      const title = article.refinedTitle?.trim() || article.title || ''
      if (title) {
        try {
          previewImage = await compositeTextOnImage(article.imageUrl, title)
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
  }

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
    <div className="w-full pt-6 pb-12">
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

              <div className="w-full max-w-[640px] flex items-center justify-between gap-4 pt-2 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={onSaveDraft}
                  className="flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-medium flex-shrink-0"
                  style={{ background: '#F0F4FF', border: '1.5px solid #C7D7FF', color: '#1A9FCC' }}
                >
                  💾 下書きに保存
                </button>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handlePreview}
                  disabled={fireflyStatus !== 'success' || !article.imageUrl}
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
