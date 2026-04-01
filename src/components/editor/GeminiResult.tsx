 'use client'

 import { useState, useEffect } from 'react'
 import { ArticleData, ProcessingState, Step } from '@/lib/types'
 import StepIndicator from './StepIndicator'
 import Button from '@/components/ui/Button'
 import GeminiLoadingCard from './GeminiLoadingCard'
 import { ArrowLeft, ArrowRight, ClipboardCopy, Check, CheckCircle } from 'lucide-react'

 interface GeminiResultProps {
   article: ArticleData
   geminiStatus: ProcessingState
   geminiError?: string | null
  showCompletionToast?: boolean
  onCompletionToastShown?: () => void
   onRefinedTitleChange?: (title: string) => void
   onRefinedContentChange: (content: string) => void
   onBack: () => void
   onNext: () => void
   onRetry?: () => void
   onStepClick?: (step: Step) => void
 }

 export default function GeminiResult({
   article,
   geminiStatus,
   geminiError,
  showCompletionToast,
  onCompletionToastShown,
   onRefinedTitleChange,
   onRefinedContentChange,
   onBack,
   onNext,
   onRetry,
   onStepClick,
 }: GeminiResultProps) {
   const [copied, setCopied] = useState(false)
   const [showToast, setShowToast] = useState(false)
 const refinedContent = typeof article.refinedContent === 'string' ? article.refinedContent : ''

   useEffect(() => {
    if (geminiStatus === 'success' && showCompletionToast) {
       setShowToast(true)
      onCompletionToastShown?.()
       const t = setTimeout(() => setShowToast(false), 2500)
       return () => clearTimeout(t)
     }
  }, [geminiStatus, showCompletionToast, onCompletionToastShown])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(refinedContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="w-full pt-6 pb-12">
      <div className="flex gap-8 items-start">
        {/* 左：メインコンテンツ（可変幅） */}
        <div className="flex-1 min-w-0 flex flex-col gap-5">
           {/* ローディング（戻るボタンは下の「記事を修正する」でいつでも前のステップに戻れます） */}
           {geminiStatus === 'loading' && (
             <div className="w-full flex flex-col items-center">
               <div className="w-full max-w-4xl space-y-3">
                 <GeminiLoadingCard />
                 <p className="text-xs text-[#64748B]">
                   推敲中です。キャンセルする場合は下の「記事を修正する」で戻れます。
                 </p>
               </div>
             </div>
           )}

           {/* エラー */}
           {geminiStatus === 'error' && geminiError && (
             <div className="rounded-lg bg-red-50 border border-red-200 px-5 py-4 space-y-3">
               <p className="text-sm font-medium text-red-800">推敲できませんでした</p>
               <p className="text-sm text-red-700">{geminiError}</p>
               {onRetry && (
                 <Button variant="primary" size="md" onClick={onRetry}>
                   再度推敲する
                 </Button>
               )}
             </div>
           )}

          {/* 2カラム（各カラム上にタイトルボックス） */}
          {(geminiStatus === 'success' || geminiStatus === 'error') && (
            <div
              className="
                grid grid-cols-2 gap-6 rounded-xl border border-[#E2E8F0] overflow-hidden shadow-sm
              "
            >
              {/* 左: 元の記事 */}
              <div className="flex flex-col bg-[#F8FAFC]">
                <div className="flex items-center justify-between px-5 py-3 border-b border-[#E2E8F0]">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
                      元の記事
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#E2E8F0] text-[#64748B]">
                      入力済み
                    </span>
                  </div>
                  {/* 右カラムのコピー ボタンと高さを揃えるためのダミーボタン（見た目は非表示） */}
                  <button
                    type="button"
                    aria-hidden="true"
                    className="
                      inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                      border border-[#E2E8F0] text-[#F8FAFC] opacity-0
                    "
                    tabIndex={-1}
                  >
                    <ClipboardCopy size={13} />
                    全文コピー
                  </button>
                </div>
                <div className="px-5 py-3 border-b border-[#E2E8F0]">
                  <label className="block text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-1.5">
                    記事タイトル
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={article.title}
                    className="
                      w-full px-4 py-2 rounded-lg border border-[#E2E8F0]
                      bg-[#F1F5F9] text-[#64748B] text-sm placeholder-[#CBD5E1]
                      focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/30 focus:border-[#1B2A4A]
                      transition-all
                    "
                  />
                </div>
                 <textarea
                   readOnly
                   value={article.originalContent}
                   className="
                     flex-1 px-5 py-4
                     bg-[#F8FAFC] text-[#64748B] text-sm resize-none
                     min-h-[560px] max-h-[72vh]
                     focus:outline-none
                   "
                 />
               </div>

              {/* 右: Gemini 改善後 */}
              <div className="flex flex-col bg-white">
                 <div className="flex items-center justify-between px-5 py-3 border-b border-[#E2E8F0]">
                   <div className="flex items-center gap-2">
                     <span className="text-xs font-semibold text-[#16A34A] uppercase tracking-wider">
                       Gemini 改善後
                     </span>
                     <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                       AI推敲済み
                     </span>
                   </div>
                   <button
                     onClick={handleCopy}
                     className="
                       inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                       border border-[#E2E8F0] text-[#1B2A4A]
                       hover:bg-[#1B2A4A] hover:text-white hover:border-[#1B2A4A]
                       transition-colors
                     "
                   >
                     {copied ? (
                       <>
                         <Check size={13} className="text-green-500" />
                         コピー済み
                       </>
                     ) : (
                       <>
                         <ClipboardCopy size={13} />
                         全文コピー
                       </>
                     )}
                   </button>
                 </div>
                 <div className="px-5 py-3 border-b border-[#E2E8F0]">
                   <label className="block text-xs font-semibold text-[#16A34A] uppercase tracking-wider mb-1.5">
                     記事タイトル
                   </label>
                   <input
                     type="text"
                     value={article.refinedTitle || article.title}
                     onChange={e => onRefinedTitleChange?.(e.target.value)}
                     placeholder="推敲後のタイトル"
                     className="
                       w-full px-4 py-2 rounded-lg border border-[#E2E8F0]
                       text-[#1A1A2E] placeholder-[#CBD5E1] text-sm
                       focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/30 focus:border-[#1B2A4A]
                       transition-all
                     "
                   />
                 </div>
                 <textarea
                   value={refinedContent}
                   onChange={e => onRefinedContentChange(e.target.value)}
                   className="
                     flex-1 px-5 py-4
                     bg-white text-[#1A1A2E] text-sm resize-none
                     min-h-[560px] max-h-[72vh]
                     focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#1B2A4A]/20
                     transition-all
                   "
                 />
               </div>
             </div>
           )}

        </div>

        {/* 右：StepIndicator（固定幅） */}
        <div className="flex-shrink-0 w-[140px] pt-2">
          <StepIndicator currentStep={2} onStepClick={onStepClick} />
        </div>
      </div>

      {/* 下：ナビゲーションボタン */}
      <div className="flex justify-between mt-8">
        <Button variant="ghost" size="md" onClick={onBack}>
          <ArrowLeft size={16} />
          記事を修正する
        </Button>
        <Button
          variant="primary"
          size="lg"
          onClick={onNext}
          disabled={geminiStatus !== 'success' || !refinedContent.trim()}
        >
          ③ 画像を生成する
          <ArrowRight size={18} />
        </Button>
      </div>

      {/* トースト通知 */}
       <div
         className={`
           fixed bottom-6 right-6 z-50
           flex items-center gap-2 px-4 py-3
           bg-[#16A34A] text-white text-sm font-medium rounded-xl shadow-lg
           transition-all duration-300
           ${showToast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'}
         `}
       >
         <CheckCircle size={16} />
         Geminiによる推敲が完了しました
       </div>
     </div>
   )
 }

