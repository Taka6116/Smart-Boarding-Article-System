'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { ArticleData, Step } from '@/lib/types'
import { SavedPrompt, getAllPrompts } from '@/lib/promptStorage'
import { SavedKeyword, getAllKeywords } from '@/lib/keywordStorage'
import StepIndicator from './StepIndicator'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { ArrowRight, Trash2, Sparkles, ChevronDown, Check } from 'lucide-react'

interface ArticleInputProps {
  article: ArticleData
  onTitleChange: (title: string) => void
  onTargetKeywordChange: (kw: string) => void
  onContentChange: (content: string) => void
  onNext: () => void
  onClear?: () => void
  onStepClick?: (step: Step) => void
}

export default function ArticleInput({
  article,
  onTitleChange,
  onTargetKeywordChange,
  onContentChange,
  onNext,
  onClear,
  onStepClick,
}: ArticleInputProps) {
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatingStep, setGeneratingStep] = useState<string>('loading')
  const [draftError, setDraftError] = useState<string | null>(null)
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([])
  const [savedKeywords, setSavedKeywords] = useState<SavedKeyword[]>([])
  const [showPromptDropdown, setShowPromptDropdown] = useState(false)
  const [showKeywordDropdown, setShowKeywordDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const keywordDropdownRef = useRef<HTMLDivElement>(null)

  const reloadLibraries = useCallback(() => {
    setSavedPrompts(getAllPrompts())
    setSavedKeywords(getAllKeywords())
  }, [])

  useEffect(() => {
    reloadLibraries()
  }, [reloadLibraries])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') reloadLibraries()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reloadLibraries])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const t = event.target as Node
      if (dropdownRef.current?.contains(t)) return
      if (keywordDropdownRef.current?.contains(t)) return
      setShowPromptDropdown(false)
      setShowKeywordDropdown(false)
    }
    if (showPromptDropdown || showKeywordDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showPromptDropdown, showKeywordDropdown])

  const handleSelectPrompt = (p: SavedPrompt) => {
    setPrompt(p.content)
    setShowPromptDropdown(false)
  }

  const handleSelectKeyword = (k: SavedKeyword) => {
    onTargetKeywordChange(k.content)
    setShowKeywordDropdown(false)
  }

  const hasDraft = Boolean(article.title.trim() || article.originalContent.trim())
  const isDisabled = !article.title.trim() || !article.originalContent.trim()
  const charCount = article.originalContent.length

  const charBadge = () => {
    if (charCount === 0) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F1F5F9] text-[#94A3B8]">
          0文字
        </span>
      )
    }
    if (charCount < 100) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-600 border border-orange-200">
          {charCount.toLocaleString()}文字 · もう少し入力してください
        </span>
      )
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
        {charCount.toLocaleString()}文字
      </span>
    )
  }

  const handleGenerate = async () => {
    const trimmed = prompt.trim()
    const kw = (article.targetKeyword ?? '').trim()
    if (!trimmed || !kw || generating) return
    setDraftError(null)
    setGenerating(true)
    setGeneratingStep('loading')
    try {
      // 資料読み込み（今回は即時切り替えでもよいが少し見せるため待機）
      await new Promise(resolve => setTimeout(resolve, 800))
      
      setGeneratingStep('writing')
      const res = await fetch('/api/gemini/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: trimmed,
          targetKeyword: article.targetKeyword ?? '',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '一次執筆の生成に失敗しました')
      
      setGeneratingStep('done')
      await new Promise(resolve => setTimeout(resolve, 600))
      
      const title = typeof data.title === 'string' ? data.title.trim() : ''
      const content = typeof data.content === 'string' ? data.content : ''
      if (title) onTitleChange(title)
      if (content) onContentChange(content)
      setGenerating(false)
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : '一次執筆の生成に失敗しました')
      setGenerating(false)
    }
  }

  const handleClear = () => {
    setPrompt('')
    setDraftError(null)
    onTitleChange('')
    onContentChange('')
    onClear?.()
  }

  return (
    <div className="w-full pt-6 pb-12">
      <div className="flex gap-8 items-start">
        <div className="flex-1 min-w-0 flex flex-col gap-5">
          <Card className="relative overflow-hidden">
            {/* 生成中のローディングオーバーレイ */}
            {generating && <GeneratingLoader step={generatingStep} />}

            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-bold text-[#1A1A2E] mb-0.5">一次執筆</h2>
                <p className="text-sm text-[#64748B]">
                  プロンプトで指示を出し、Geminiが記事のタイトル・本文を生成します。
                </p>
              </div>
              {hasDraft && onClear && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#DC2626] hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors"
                >
                  <Trash2 size={13} />
                  入力をクリア
                </button>
              )}
            </div>

            {/* プロンプト */}
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-1.5 relative">
                  <label className="block text-sm font-semibold text-[#1A1A2E]">
                    プロンプト（指示）
                  </label>
                  {savedPrompts.length > 0 && (
                    <div className="relative" ref={dropdownRef}>
                      <button
                        type="button"
                        onClick={() => setShowPromptDropdown(!showPromptDropdown)}
                        className="text-xs text-[#002C93] font-medium hover:underline flex items-center gap-1"
                      >
                        保存済みプロンプトから入力 <ChevronDown size={14} />
                      </button>
                      {showPromptDropdown && (
                        <div className="absolute right-0 top-full mt-2 w-[320px] bg-white border border-[#E2E8F0] shadow-lg rounded-lg z-10 max-h-[300px] overflow-y-auto">
                          {savedPrompts.map(p => (
                            <button
                              key={p.id}
                              onClick={() => handleSelectPrompt(p)}
                              className="w-full text-left px-4 py-3 border-b border-[#E2E8F0] last:border-0 hover:bg-[#F8FAFC] transition-colors"
                            >
                              <div className="font-bold text-sm text-[#1A1A2E] mb-1">{p.title}</div>
                              <div className="text-xs text-[#64748B] line-clamp-2">{p.content}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="例：事業承継の基礎について、相談先の種類・手順・注意点を分かりやすく2000字程度で記事を書いてください"
                  className="
                    w-full px-4 py-3 rounded-lg border border-[#E2E8F0]
                    text-[#1A1A2E] placeholder-[#CBD5E1]
                    focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/30 focus:border-[#1B2A4A]
                    transition-all text-sm resize-y
                    min-h-[140px]
                  "
                  disabled={generating}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2 gap-2">
                  <label className="block text-sm font-semibold text-[#1A1A2E] min-w-0">
                    ターゲットキーワード
                    <span className="block mt-0.5 text-xs font-semibold text-red-600">
                      ※　必須　必ず設定してください！
                    </span>
                  </label>
                  <div className="relative shrink-0" ref={keywordDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setShowKeywordDropdown(!showKeywordDropdown)}
                      className="text-xs text-[#002C93] font-medium hover:underline flex items-center gap-1 whitespace-nowrap"
                    >
                      保存済みキーワードから入力 <ChevronDown size={14} />
                    </button>
                    {showKeywordDropdown && (
                      <div className="absolute right-0 top-full mt-2 w-[320px] bg-white border border-[#E2E8F0] shadow-lg rounded-lg z-10 max-h-[300px] overflow-y-auto">
                        {savedKeywords.length === 0 ? (
                          <div className="px-4 py-4 text-sm text-[#64748B] leading-relaxed">
                            <p className="mb-3">キーワードライブラリに保存されたセットはまだありません。</p>
                            <Link
                              href="/keywords"
                              className="font-medium text-[#002C93] hover:underline"
                              onClick={() => setShowKeywordDropdown(false)}
                            >
                              キーワードページで追加する
                            </Link>
                          </div>
                        ) : (
                          savedKeywords.map(k => (
                            <button
                              key={k.id}
                              type="button"
                              onClick={() => handleSelectKeyword(k)}
                              className="w-full text-left px-4 py-3 border-b border-[#E2E8F0] last:border-0 hover:bg-[#F8FAFC] transition-colors"
                            >
                              <div className="font-bold text-sm text-[#1A1A2E] mb-1">{k.title}</div>
                              <div className="text-xs text-[#64748B] line-clamp-2">{k.content}</div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <input
                  type="text"
                  value={article.targetKeyword ?? ''}
                  onChange={e => onTargetKeywordChange(e.target.value)}
                  placeholder="例：事業承継 M&A, 中小企業 事業承継, 後継者不足, M&A 相談, デューデリジェンス, アドバイザー 選び方"
                  className="w-full px-4 py-3 rounded-lg text-sm border border-[#E2E8F0] text-[#1A1A2E] bg-[#FAFBFC] focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/30"
                />
              </div>

              <div className="flex justify-start">
                <Button
                  variant="primary"
                  disabled={!prompt.trim() || !(article.targetKeyword ?? '').trim() || generating}
                  onClick={handleGenerate}
                  className="py-3 px-6 h-auto"
                >
                  {generating ? (
                    <span className="font-bold text-base">記事を作成中...</span>
                  ) : (
                    <>
                      <Sparkles size={18} className="mr-2" />
                      <span className="font-bold text-base">記事作成</span>
                    </>
                  )}
                </Button>
              </div>

              {draftError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
                  {draftError}
                </div>
              )}
            </div>

            {/* 生成後のタイトル・本文（編集可） */}
            {hasDraft && (
              <>
                <hr className="my-6 border-[#E2E8F0]" />
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-[#1A1A2E] mb-1.5">
                      記事タイトル
                    </label>
                    <input
                      type="text"
                      value={article.title}
                      onChange={e => onTitleChange(e.target.value)}
                      placeholder="記事のタイトル"
                      className="
                        w-full px-4 py-2.5 rounded-lg border border-[#E2E8F0]
                        text-[#1A1A2E] placeholder-[#CBD5E1]
                        focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/30 focus:border-[#1B2A4A]
                        transition-all text-sm
                      "
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#1A1A2E] mb-1.5">
                      記事本文
                    </label>
                    <textarea
                      value={article.originalContent}
                      onChange={e => onContentChange(e.target.value)}
                      placeholder="記事本文"
                      className="
                        w-full px-4 py-3 rounded-lg border border-[#E2E8F0]
                        text-[#1A1A2E] placeholder-[#CBD5E1]
                        focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/30 focus:border-[#1B2A4A]
                        transition-all text-sm resize-y
                        min-h-[320px]
                      "
                    />
                    <div className="flex justify-end mt-1.5">{charBadge()}</div>
                  </div>
                </div>
                <div className="flex justify-end mt-6 pt-5 border-t border-[#E2E8F0]">
                  <Button
                    variant="primary"
                    disabled={isDisabled}
                    onClick={onNext}
                    className="py-4 px-8 h-auto"
                  >
                    <span className="font-bold text-base">Geminiで推敲する</span>
                    <ArrowRight size={18} className="ml-2" />
                  </Button>
                </div>
              </>
            )}
          </Card>
        </div>
        <div className="flex-shrink-0 w-[140px] pt-2">
          <StepIndicator currentStep={1} onStepClick={onStepClick} />
        </div>
      </div>
    </div>
  )
}

const GENERATING_CHECKLIST: { id: string; label: string }[] = [
  { id: 'research', label: '参照・リサーチ準備' },
  { id: 'outline', label: '構成・論点の整理' },
  { id: 'draft', label: '本文ドラフト生成' },
  { id: 'finish', label: '反映・仕上げ' },
]

/**
 * チェックリスト各行の状態を progress % に応じて均等に遷移させる。
 * 4ステップを 0→30→55→78→100 で区切り、各ステップに体感上の時間を持たせる。
 */
function checklistRowState(
  step: string,
  index: number,
  loadingPhase: number,
  progress: number
): 'done' | 'active' | 'pending' {
  if (step === 'done') return 'done'
  if (step === 'loading') {
    if (index < loadingPhase) return 'done'
    if (index === loadingPhase) return 'active'
    return 'pending'
  }
  if (step === 'writing') {
    const thresholds = [30, 55, 78]
    let activeIdx = 0
    for (const t of thresholds) {
      if (progress >= t) activeIdx++
    }
    if (index < activeIdx) return 'done'
    if (index === activeIdx) return 'active'
    return 'pending'
  }
  return 'pending'
}

function checklistActiveHint(
  step: string,
  index: number,
  loadingPhase: number,
  progress: number
): string | null {
  const state = checklistRowState(step, index, loadingPhase, progress)
  if (state !== 'active') return null
  if (step === 'loading' && loadingPhase === 0) return '参照資料を読み込んでいます…'
  if (step === 'loading' && loadingPhase === 1) return '論点を整理しています…'
  if (step === 'writing' && index === 0) return '参照資料を確認しています…'
  if (step === 'writing' && index === 1) return '構成・論点を整理しています…'
  if (step === 'writing' && index === 2) return '本文ドラフトを生成しています…'
  if (step === 'writing' && index === 3) return '形式を整え、仕上げています…'
  return '処理しています…'
}

function GeneratingLoader({ step }: { step: string }) {
  const [progress, setProgress] = useState(0)
  const [loadingPhase, setLoadingPhase] = useState(0)
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduceMotion(mq.matches)
    const onChange = () => setReduceMotion(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (step !== 'loading') {
      setLoadingPhase(0)
      return
    }
    setLoadingPhase(0)
    const t = window.setTimeout(() => setLoadingPhase(1), 420)
    return () => window.clearTimeout(t)
  }, [step])

  useEffect(() => {
    if (step !== 'loading') return
    setProgress(3 + loadingPhase * 4)
  }, [step, loadingPhase])

  useEffect(() => {
    if (step !== 'writing') return
    let currentProgress = 8
    setProgress(currentProgress)
    const timer = setInterval(() => {
      currentProgress += (96 - currentProgress) * 0.03
      setProgress(Math.min(96, Math.floor(currentProgress)))
    }, 500)
    return () => clearInterval(timer)
  }, [step])

  useEffect(() => {
    if (step === 'done') setProgress(100)
  }, [step])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="generating-loader-title"
      aria-busy="true"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 max-w-md w-full p-6 sm:p-8 text-left">
        <div className="flex items-start gap-4 mb-6">
          <div
            className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center border border-indigo-100"
            style={{
              background: '#EEF2FF',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
            }}
          >
            <Sparkles
              className={`w-5 h-5 text-[#1B2A4A] ${reduceMotion ? '' : 'motion-safe:opacity-90 motion-safe:animate-pulse'}`}
              aria-hidden
            />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h2 id="generating-loader-title" className="text-base font-bold text-[#1A1A2E] leading-snug">
              Gemini が執筆しています
            </h2>
            <p className="text-xs text-[#64748B] mt-1.5 leading-relaxed">
              編集方針に沿って下書きを生成しています
            </p>
          </div>
          <div
            className="flex-shrink-0 text-2xl font-bold tabular-nums leading-none pt-0.5"
            style={{ color: '#1B2A4A' }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`生成進捗 ${progress} パーセント`}
          >
            {progress}%
          </div>
        </div>

        <div className="mb-6">
          <div className="h-2 rounded-full overflow-hidden bg-[#E2E8F0]">
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{
                width: `${progress}%`,
                backgroundColor: '#1B2A4A',
              }}
            />
          </div>
          <div className="flex justify-between mt-2 text-[10px] tracking-[0.08em] font-semibold uppercase text-[#94A3B8]">
            <span>準備</span>
            <span>仕上げ</span>
          </div>
        </div>

        <ul className="space-y-2 mb-6 list-none p-0 m-0">
          {GENERATING_CHECKLIST.map((item, i) => {
            const state = checklistRowState(step, i, loadingPhase, progress)
            const hint = checklistActiveHint(step, i, loadingPhase, progress)
            return (
              <li
                key={item.id}
                className={`flex items-start gap-3 rounded-xl transition-all duration-300 ${
                  state === 'active'
                    ? 'bg-[#F8FAFC] shadow-[inset_0_0_0_1px_rgba(226,232,240,0.9)] -mx-1 px-3 py-2.5'
                    : 'py-1 px-1'
                }`}
              >
                {state === 'done' && (
                  <span
                    className="flex-shrink-0 w-5 h-5 mt-0.5 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: '#DBEAFE' }}
                  >
                    <Check className="w-3 h-3 text-blue-700" strokeWidth={2.5} aria-hidden />
                  </span>
                )}
                {state === 'active' && (
                  <span
                    className={`flex-shrink-0 w-5 h-5 mt-0.5 rounded-full border-2 flex items-center justify-center bg-white ${
                      reduceMotion ? '' : 'animate-loader-ring'
                    }`}
                    style={{ borderColor: '#1B2A4A' }}
                    aria-current="step"
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${reduceMotion ? '' : 'animate-loader-dot-soft'}`}
                      style={{ backgroundColor: '#1B2A4A' }}
                    />
                  </span>
                )}
                {state === 'pending' && (
                  <span
                    className="flex-shrink-0 w-5 h-5 mt-0.5 rounded-full border-2 border-[#E2E8F0] bg-white"
                    aria-hidden
                  />
                )}
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0">
                    <span
                      className={`text-xs sm:text-sm leading-snug ${
                        state === 'pending' ? 'text-[#94A3B8]' : 'text-[#334155]'
                      } ${state === 'active' ? 'font-semibold text-[#1A1A2E]' : ''}`}
                    >
                      {item.label}
                    </span>
                    {state === 'active' && !reduceMotion && (
                      <span className="inline-flex gap-1 items-center" aria-hidden>
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#1B2A4A] animate-loader-dot-soft" />
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full bg-[#1B2A4A] animate-loader-dot-soft"
                          style={{ animationDelay: '120ms' }}
                        />
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full bg-[#1B2A4A] animate-loader-dot-soft"
                          style={{ animationDelay: '240ms' }}
                        />
                      </span>
                    )}
                    {state === 'active' && reduceMotion && (
                      <span className="text-xs font-semibold text-[#1B2A4A]" aria-hidden>
                        …
                      </span>
                    )}
                  </div>
                  {hint && (
                    <p className="text-[10px] sm:text-[11px] text-[#64748B] mt-1.5 leading-relaxed motion-safe:transition-opacity">
                      {hint}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        <div className="flex items-center justify-between pt-5 border-t border-[#F1F5F9]">
          <div className="flex items-center -space-x-2" aria-hidden>
            <div
              className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold text-[#64748B]"
              style={{ background: '#F1F5F9' }}
            >
              You
            </div>
            <div
              className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold text-[#1B2A4A]"
              style={{ background: '#EEF2FF' }}
            >
              AI
            </div>
          </div>
          <button
            type="button"
            disabled
            className="text-[11px] font-semibold tracking-wide text-[#94A3B8] cursor-not-allowed"
            title="現在はキャンセルできません"
          >
            生成をキャンセル
          </button>
        </div>
      </div>
    </div>
  )
}

