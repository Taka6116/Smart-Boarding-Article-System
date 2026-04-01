'use client'

import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'

const STEPS = [
  { label: '記事を読み込んでいます',      detail: '文章構造・段落・キーワードを解析中...' },
  { label: 'SEO品質をチェックしています', detail: '見出し構成・キーワード密度・読みやすさを確認中...' },
  { label: '文章を改善しています',        detail: 'より自然で説得力のある表現に書き直し中...' },
  { label: '最終チェックをしています',    detail: 'M&A業界の専門性・正確性を確認中...' },
]

export default function GeminiLoadingCard() {
  const [activeStep, setActiveStep] = useState(0)
  const [progress,   setProgress]   = useState(0)
  const [dots,       setDots]       = useState('')

  useEffect(() => {
    const stepTimer = setInterval(() => {
      setActiveStep(prev => (prev < STEPS.length - 1 ? prev + 1 : prev))
    }, 4000) // 2200から4000に延長して、最後のステップ到達を遅らせる
    return () => clearInterval(stepTimer)
  }, [])

  useEffect(() => {
    const progressTimer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 98) return 98
        const remaining = 98 - prev
        // 50%以降はスピードを落とし、98%で長く止まらないようにする
        let step: number
        if (prev >= 80) {
          step = Math.max(0.03, remaining * 0.008)
        } else if (prev >= 60) {
          step = Math.max(0.06, remaining * 0.02)
        } else if (prev >= 40) {
          step = Math.max(0.1, remaining * 0.03)
        } else {
          step = Math.max(0.15, remaining * 0.05)
        }
        return prev + step
      })
    }, 220)
    return () => clearInterval(progressTimer)
  }, [])

  useEffect(() => {
    const dotsTimer = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.')
    }, 500)
    return () => clearInterval(dotsTimer)
  }, [])

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'white',
        border: '1px solid #E2E8F0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 8px 32px rgba(0,0,0,0.06)',
      }}
    >
      {/* 上部：アイコン + タイトル */}
      <div
        className="px-8 pt-10 pb-6 flex flex-col items-center text-center"
        style={{ background: 'linear-gradient(180deg, #F8FAFC 0%, white 100%)' }}
      >
        <div className="relative w-20 h-20 mb-5">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              border: '2px solid transparent',
              borderTopColor: '#C0392B',
              borderRightColor: '#C0392B40',
              animation: 'spin 1.2s linear infinite',
            }}
          />
          <div
            className="absolute inset-2 rounded-full"
            style={{
              border: '2px solid transparent',
              borderTopColor: '#1B2A4A',
              borderLeftColor: '#1B2A4A40',
              animation: 'spin 2s linear infinite reverse',
            }}
          />
          <div
            className="absolute inset-4 rounded-full flex items-center justify-center"
            style={{ background: '#FDF0EE' }}
          >
            <Sparkles size={20} style={{ color: '#C0392B' }} />
          </div>
        </div>

        <h3 className="text-lg font-bold mb-1" style={{ color: '#1A1A2E' }}>
          Gemini が記事を推敲中{dots}
        </h3>
        <p className="text-sm" style={{ color: '#64748B' }}>
          AIが品質・読みやすさ・SEOを自動改善しています
        </p>
      </div>

      {/* 処理ステップリスト */}
      <div className="px-8 py-6 space-y-3">
        {STEPS.map((step, index) => {
          const isDone   = index < activeStep
          const isActive = index === activeStep
          const isWait   = index > activeStep

          return (
            <div
              key={index}
              className="flex items-start gap-3 transition-all duration-500"
              style={{ opacity: isWait ? 0.35 : 1 }}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-300"
                style={{
                  background: isDone ? '#1B2A4A' : isActive ? '#FDF0EE' : '#F1F5F9',
                  border: isActive ? '2px solid #C0392B' : 'none',
                }}
              >
                {isDone ? (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                ) : isActive ? (
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ background: '#C0392B', animation: 'pulse 1s ease infinite' }}
                  />
                ) : (
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#CBD5E1' }} />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-medium transition-colors duration-300"
                  style={{ color: isDone ? '#64748B' : isActive ? '#1A1A2E' : '#94A3B8' }}
                >
                  {step.label}
                  {isDone && (
                    <span
                      className="ml-2 text-xs px-2 py-0.5 rounded-full"
                      style={{ background: '#F0FDF4', color: '#16A34A', fontFamily: 'DM Mono' }}
                    >
                      完了
                    </span>
                  )}
                </p>
                {isActive && (
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: '#94A3B8', animation: 'fadeIn 0.4s ease' }}
                  >
                    {step.detail}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* プログレスバー */}
      <div className="px-8 pb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs" style={{ color: '#94A3B8', fontFamily: 'DM Mono' }}>
            処理中
          </span>
          <span className="text-xs font-medium" style={{ color: '#1B2A4A', fontFamily: 'DM Mono' }}>
            {Math.round(progress)}%
          </span>
        </div>
        <div
          className="w-full h-1.5 rounded-full overflow-hidden"
          style={{ background: '#F1F5F9' }}
        >
          <div
            className="h-full rounded-full transition-all duration-300 ease-out"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #1B2A4A 0%, #C0392B 100%)',
            }}
          />
        </div>
      </div>
    </div>
  )
}
