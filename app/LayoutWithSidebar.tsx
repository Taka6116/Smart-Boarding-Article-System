'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import MainContentWidth from './MainContentWidth'

export default function LayoutWithSidebar({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isLogin = pathname === '/login'

  if (isLogin) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen bg-[#F5F7FA] px-4">
        {children}
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      <aside
        className="
          fixed top-0 left-0 h-screen w-[220px] flex-shrink-0 z-40
          text-white border-r flex flex-col
        "
        style={{ backgroundColor: '#33B5E5', borderColor: '#2AA3D0' }}
      >
        <div className="px-5 py-4 border-b" style={{ borderColor: '#2AA3D0' }}>
          <div className="text-[23px] font-bold tracking-wide">SBAS</div>
          <div className="text-[14px] text-[#94A3B8] font-mono mt-0.5">
            Smart Boarding Article System
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 text-sm space-y-6">
          <div>
            <div className="space-y-1">
              {[
                { href: '/editor', label: '記事を作成' },
                { href: '/articles', label: '保存済み記事一覧' },
                { href: '/published', label: '過去投稿済み記事一覧' },
                { href: '/schedule', label: '投稿スケジュール' },
                { href: '/prompts', label: 'プロンプト' },
                { href: '/keywords', label: 'キーワード' },
                { href: '/notice', label: '注意書き' },
              ].map(({ href, label }) => {
                const isActive = pathname === href || pathname.startsWith(href + '/')
                return (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center px-3 py-2.5 rounded-lg text-[16px] font-semibold transition-all"
                    style={{
                      color: isActive ? '#FFFFFF' : '#E2E8F0',
                      background: isActive ? '#2AA3D0' : 'transparent',
                      boxShadow: isActive ? 'inset 3px 0 0 #60A5FA' : 'none',
                    }}
                  >
                    {label}
                  </Link>
                )
              })}
            </div>
          </div>
        </nav>

        <div className="px-5 py-3 text-[10px] text-[#94A3B8] border-t" style={{ borderColor: '#2AA3D0' }}>
          <p>© 株式会社FCE</p>
        </div>
      </aside>

      <div className="ml-[220px] flex-1 flex flex-col min-h-screen bg-[#F5F7FA]">
        <main className="flex-1 flex items-center justify-center px-6 py-8">
          <MainContentWidth>{children}</MainContentWidth>
        </main>
      </div>
    </div>
  )
}
