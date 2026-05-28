'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import MainContentWidth from './MainContentWidth'

export default function LayoutWithSidebar({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const isLogin = pathname === '/login'

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  if (isLogin) {
    return (
      <div
        className="flex-1 flex items-center justify-center min-h-screen px-4"
        style={{
          background: 'radial-gradient(ellipse at 30% 20%, #4FC3F7 0%, #1976D2 40%, #0D47A1 75%, #01579B 100%)',
          minHeight: '100vh',
        }}
      >
        {children}
      </div>
    )
  }

  return (
    <div
      className="flex min-h-screen"
      style={{
        background: 'linear-gradient(145deg, #E8F4FA 0%, #F5F7FA 35%, #EDF8FC 65%, #E0F0F8 100%)',
      }}
    >
      {/* サイドバー — グラスモーフィズム */}
      <aside
        className="fixed top-0 left-0 h-screen w-[220px] flex-shrink-0 z-40 flex flex-col"
        style={{
          background: 'linear-gradient(160deg, #0c6479 0%, #0e7490 50%, #0a5568 100%)',
          borderRight: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '4px 0 24px rgba(10,80,100,0.20)',
        }}
      >
        {/* ヘッダー */}
        <div
          className="px-5 py-4 flex flex-col"
          style={{
            borderBottom: '1px solid rgba(255,255,255,0.18)',
            background: 'rgba(255,255,255,0.06)',
          }}
        >
          <div
            className="text-[22px] font-bold tracking-wide text-white"
            style={{ textShadow: '0 1px 6px rgba(0,0,0,0.22)' }}
          >
            SBAS
          </div>
          <div className="text-[11px] text-white/70 font-mono mt-0.5 leading-tight">
            Smart Boarding<br />Article System
          </div>
        </div>

        {/* ナビゲーション */}
        <nav className="flex-1 px-3 py-4 text-sm space-y-1 overflow-y-auto">
          {[
            { href: '/editor', label: '記事を作成' },
            { href: '/articles', label: '保存済み記事一覧' },
            { href: '/published', label: '過去投稿済み記事一覧' },
            { href: '/schedule', label: '投稿スケジュール' },
            { href: '/ahrefs', label: 'KW分析' },
            { href: '/prompts', label: 'プロンプト' },
            { href: '/keywords', label: 'キーワード' },
            { href: '/notice', label: '注意書き' },
            { href: '/image-test', label: '画像テスト' },
          ].map(({ href, label }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center px-3 py-2.5 rounded-xl text-[14px] font-semibold transition-all duration-200"
                style={isActive ? {
                  color: '#FFFFFF',
                  background: 'rgba(255,255,255,0.14)',
                  border: '1px solid rgba(255,255,255,0.20)',
                  borderLeft: '3px solid rgba(255,255,255,0.75)',
                } : {
                  color: 'rgba(255,255,255,0.75)',
                  background: 'transparent',
                  border: '1px solid transparent',
                  borderLeft: '3px solid transparent',
                }}
              >
                {label}
              </Link>
            )
              })}

          {/* ログアウト */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center px-3 py-2.5 rounded-xl text-[14px] font-semibold transition-all duration-200 mt-2"
            style={{
              color: 'rgba(255,255,255,0.65)',
              background: 'transparent',
              borderLeft: '3px solid transparent',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          >
            ログアウト
          </button>
        </nav>

        {/* フッター */}
        <div
          className="px-4 py-4 flex flex-col items-center gap-2"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(0,0,0,0.06)',
          }}
        >
          <Image
            src="/logo-white.svg"
            alt="Smart Boarding"
            width={160}
            height={40}
            className="opacity-80"
            priority
          />
          <p className="text-[10px] text-white/35">© 株式会社FCE</p>
        </div>
      </aside>

      {/* メインコンテンツ */}
      <div className="ml-[220px] flex-1 flex flex-col min-h-screen">
        <main className="flex-1 flex items-center justify-center px-6 py-8">
          <MainContentWidth>{children}</MainContentWidth>
        </main>
      </div>
    </div>
  )
}
