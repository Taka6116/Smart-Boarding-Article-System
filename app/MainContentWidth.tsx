'use client'

import { usePathname } from 'next/navigation'

export default function MainContentWidth({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isPreview = pathname === '/preview'
  const isEditor = pathname === '/editor'
  return (
    <div
      className={`w-full ${isPreview ? 'max-w-[1600px]' : isEditor ? 'max-w-[1400px]' : 'max-w-[1000px]'}`}
    >
      {children}
    </div>
  )
}
