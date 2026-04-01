'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
    <div className="w-full max-w-sm mx-auto">
      <div
        className="rounded-2xl border shadow-lg p-8"
        style={{
          backgroundColor: '#fff',
          borderColor: '#2AA3D0',
        }}
      >
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold" style={{ color: '#33B5E5' }}>
            SBAS
          </h1>
          <p className="text-sm text-[#64748B] mt-1">Smart Boarding Article System</p>
        </div>
        <p className="text-sm text-[#475569] text-center mb-6">
          メールアドレスとパスワードを入力してください
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[#334155] mb-1">
              メールアドレス
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-4 py-2.5 rounded-lg border border-[#cbd5e1] bg-white text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#33B5E5]"
              placeholder="example@company.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[#334155] mb-1">
              パスワード
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-4 py-2.5 rounded-lg border border-[#cbd5e1] bg-white text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#33B5E5]"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg font-semibold text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: '#33B5E5' }}
          >
            {loading ? '確認中...' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  )
}
