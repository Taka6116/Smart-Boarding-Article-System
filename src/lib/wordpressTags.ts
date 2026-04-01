/** WordPress 投稿用タグ入力のパース・正規化（設計書準拠） */

import { decodeHtmlEntities } from './wpTagList'

export const MAX_WORDPRESS_TAGS = 20
export const MAX_WORDPRESS_TAG_LENGTH = 50

/** タグ候補リストで最初に見せる行数（それ以上は展開で表示） */
export const TAG_SUGGESTIONS_COLLAPSED_COUNT = 3

/** 候補一覧に出さない開発用・サンプル系タグ（選択済みチップはそのまま） */
export function isNoiseWordPressTagName(name: string): boolean {
  const t = name.trim()
  if (!t) return false
  if (t.includes('サンプル')) return true
  if (t.toLowerCase().includes('sample')) return true
  return false
}

const SEPARATOR_PATTERN = /[,、]/g

/**
 * 半角カンマ・全角読点のみで分割。スペース・改行では分割しない。
 * 各セグメントは trim のみ。内部の空白は維持。重複除去（出現順）。
 */
export function parseWordPressTagsInput(input: string): string[] {
  if (input == null || typeof input !== 'string') return []
  const raw = input.trim()
  if (!raw) return []

  const segments = raw.split(SEPARATOR_PATTERN)
  const seen = new Set<string>()
  const out: string[] = []

  for (const segment of segments) {
    let t = decodeHtmlEntities(segment.trim())
    if (!t) continue
    if (t.length > MAX_WORDPRESS_TAG_LENGTH) {
      t = t.slice(0, MAX_WORDPRESS_TAG_LENGTH)
    }
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
    if (out.length >= MAX_WORDPRESS_TAGS) break
  }

  return out
}

/** API 受信値を文字列配列に正規化（配列は「、」で連結してからパース） */
export function normalizeWordPressTagsFromRequest(tags: unknown): string[] {
  if (tags == null) return []
  if (Array.isArray(tags)) {
    const joined = tags.map(t => String(t)).join('、')
    return parseWordPressTagsInput(joined)
  }
  if (typeof tags === 'string') return parseWordPressTagsInput(tags)
  return []
}
