'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = data.error ?? 'ログインに失敗しました'
        const debug = data.debug
          ? ` [デバッグ: ${JSON.stringify(data.debug)}]`
          : ''
        setError(msg + debug)
        return
      }
      router.push('/')
      router.refresh()
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-[360px] mx-auto">

      {/* アバターサークル — カードの上に浮かせる */}
      <div className="flex justify-center mb-[-32px] relative z-10">
        <div
          className="w-[64px] h-[64px] rounded-full flex items-center justify-center text-white font-bold text-xl select-none"
          style={{
            background: 'linear-gradient(135deg, #4FC3F7, #1565C0)',
            boxShadow: '0 8px 24px rgba(21,101,192,0.45), 0 2px 0 rgba(255,255,255,0.25) inset',
            border: '3px solid rgba(255,255,255,0.6)',
          }}
        >
          SB
        </div>
      </div>

      {/* グラスモーフィズムカード */}
      <div
        className="rounded-2xl pt-12 pb-8 px-8"
        style={{
          background: 'rgba(255,255,255,0.18)',
          backdropFilter: 'blur(32px) saturate(2)',
          WebkitBackdropFilter: 'blur(32px) saturate(2)',
          border: '1px solid rgba(255,255,255,0.35)',
          boxShadow:
            '0 20px 60px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.4) inset, 0 -1px 0 rgba(0,0,0,0.1) inset',
        }}
      >
        {/* タイトル */}
        <div className="text-center mb-7">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-white/60 uppercase mb-1">
            Smart Boarding
          </p>
          <h1 className="text-[26px] font-bold text-white" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.2)' }}>
            ログイン
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* メールアドレス */}
          <div>
            <label htmlFor="email" className="block text-[12px] font-semibold text-white/70 mb-1.5 tracking-wide">
              メールアドレス
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="example@company.com"
              className="w-full px-4 py-2.5 rounded-xl text-[#0f172a] placeholder-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-white/60 transition-all text-sm"
              style={{
                background: 'rgba(255,255,255,0.82)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.5)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08) inset',
              }}
            />
          </div>

          {/* パスワード（目のアイコン付き） */}
          <div>
            <label htmlFor="password" className="block text-[12px] font-semibold text-white/70 mb-1.5 tracking-wide">
              パスワード
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full px-4 py-2.5 pr-11 rounded-xl text-[#0f172a] placeholder-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-white/60 transition-all text-sm"
                style={{
                  background: 'rgba(255,255,255,0.82)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255,255,255,0.5)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08) inset',
                }}
              />
              {/* 目のアイコン */}
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-[#1565C0] transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
              >
                {showPassword ? (
                  /* 目を閉じるアイコン */
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.477 10.477A3 3 0 0013.5 13.5M6.228 6.228A10.45 10.45 0 003 12c1.657 3.58 5.373 6 9 6a10.45 10.45 0 004.772-1.14M9.88 9.88A3 3 0 0112 9c1.657 0 3 1.343 3 3 0 .12-.008.238-.023.354M21 12c-.653 1.41-1.6 2.677-2.772 3.728" />
                  </svg>
                ) : (
                  /* 目を開くアイコン */
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* エラー表示 */}
          {error && (
            <p className="text-sm rounded-xl px-3 py-2 text-center"
              style={{
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.3)',
                color: '#fecaca',
              }}
            >
              {error}
            </p>
          )}

          {/* ログインボタン */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-white text-sm tracking-wide transition-all duration-200 disabled:opacity-50 hover:brightness-110 hover:shadow-xl mt-2"
            style={{
              background: 'linear-gradient(135deg, #1E88E5 0%, #1565C0 50%, #0D47A1 100%)',
              boxShadow: '0 6px 20px rgba(21,101,192,0.5), 0 1px 0 rgba(255,255,255,0.2) inset',
            }}
          >
            {loading ? '確認中...' : 'ログイン'}
          </button>
        </form>
      </div>

      {/* 下部コピーライト */}
      <p className="text-center text-[11px] text-white/40 mt-5">© 株式会社FCE</p>
    </div>
  )
}
