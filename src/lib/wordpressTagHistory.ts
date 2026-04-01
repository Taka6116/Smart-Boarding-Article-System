/** ブラウザに保存する「最近使った WordPress タグ」候補 */

import { decodeHtmlEntities } from './wpTagList'

export const WORDPRESS_TAG_HISTORY_KEY = 'nas-wordpress-tag-history'
export const MAX_WORDPRESS_TAG_HISTORY = 80

export function loadWordPressTagHistory(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(WORDPRESS_TAG_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map(t => decodeHtmlEntities(String(t).trim())).filter(Boolean)
  } catch {
    return []
  }
}

/** 先頭ほど新しい。重複除去・最大件数でトリム */
export function mergeIntoWordPressTagHistory(current: string[], prev?: string[]): string[] {
  const fromStorage = prev ?? loadWordPressTagHistory()
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of [...current, ...fromStorage]) {
    const s = decodeHtmlEntities(t.trim())
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
    if (out.length >= MAX_WORDPRESS_TAG_HISTORY) break
  }
  return out
}

export function saveWordPressTagHistory(tags: string[]): void {
  if (typeof window === 'undefined') return
  try {
    const merged = mergeIntoWordPressTagHistory(tags)
    localStorage.setItem(WORDPRESS_TAG_HISTORY_KEY, JSON.stringify(merged))
  } catch {
    /* ignore quota */
  }
}
