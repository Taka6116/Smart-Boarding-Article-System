/** ブラウザに保存する「タグ候補一覧から隠す」名前リスト（WordPress 上の削除は行わない） */

import { decodeHtmlEntities } from './wpTagList'

export const WORDPRESS_TAG_HIDDEN_KEY = 'nas-wordpress-tag-hidden'
export const MAX_WORDPRESS_TAG_HIDDEN = 200

export function loadWordPressTagHidden(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(WORDPRESS_TAG_HIDDEN_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map(t => decodeHtmlEntities(String(t).trim())).filter(Boolean)
  } catch {
    return []
  }
}

function dedupeCap(names: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of names) {
    const s = decodeHtmlEntities(t.trim())
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
    if (out.length >= MAX_WORDPRESS_TAG_HIDDEN) break
  }
  return out
}

export function saveWordPressTagHidden(hidden: string[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(WORDPRESS_TAG_HIDDEN_KEY, JSON.stringify(dedupeCap(hidden)))
  } catch {
    /* ignore quota */
  }
}

/** 一覧から隠す名前を追加し、保存後の配列を返す */
export function addWordPressTagHidden(name: string, prev: string[]): string[] {
  const t = decodeHtmlEntities(name.trim())
  if (!t) return prev
  if (prev.includes(t)) return prev
  const next = dedupeCap([...prev, t])
  saveWordPressTagHidden(next)
  return next
}

/** 隠しを解除し、保存後の配列を返す */
export function removeWordPressTagHidden(name: string, prev: string[]): string[] {
  const t = decodeHtmlEntities(name.trim())
  const next = prev.filter(x => x !== t)
  saveWordPressTagHidden(next)
  return next
}
