'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  text: string
}

/**
 * テーブル内でもクリップされないよう、説明を body 直下に fixed で表示する。
 */
export function ColumnHint({ text }: Props) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const [box, setBox] = useState({ top: 0, left: 0, width: 280, placeAbove: false })

  const updateBox = useCallback(() => {
    const el = anchorRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const maxW = 280
    const w = Math.min(maxW, window.innerWidth - 16)
    let left = r.left + r.width / 2 - w / 2
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8))
    const gap = 8
    const estHeight = 100
    const placeAbove = r.bottom + estHeight + gap > window.innerHeight - 12
    const top = placeAbove ? r.top - gap : r.bottom + gap
    setBox({ top, left, width: w, placeAbove })
  }, [])

  const show = useCallback(() => {
    updateBox()
    setVisible(true)
  }, [updateBox])

  const hide = useCallback(() => {
    setVisible(false)
  }, [])

  useEffect(() => {
    if (!visible) return
    const on = () => updateBox()
    window.addEventListener('scroll', on, true)
    window.addEventListener('resize', on)
    return () => {
      window.removeEventListener('scroll', on, true)
      window.removeEventListener('resize', on)
    }
  }, [visible, updateBox])

  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, hide])

  return (
    <>
      <span
        ref={anchorRef}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-[#94A3B8] text-[9px] font-bold text-[#64748B] cursor-help shrink-0 select-none leading-none outline-none focus-visible:ring-2 focus-visible:ring-[#33B5E5] focus-visible:ring-offset-1"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        role="button"
        tabIndex={0}
        aria-label={text}
      >
        i
      </span>
      {visible &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed z-[9999] rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 text-left text-xs leading-relaxed text-[#334155] shadow-lg max-h-48 overflow-y-auto pointer-events-none"
            aria-hidden="true"
            style={{
              top: box.top,
              left: box.left,
              width: box.width,
              transform: box.placeAbove ? 'translateY(-100%)' : undefined,
            }}
            role="tooltip"
          >
            {text}
          </div>,
          document.body
        )}
    </>
  )
}
