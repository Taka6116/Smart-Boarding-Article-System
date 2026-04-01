/** WordPress REST /wp/v2/tags の一覧用（クライアント・API 共通） */
export interface WpTagListItem {
  id: number
  name: string
  slug: string
  count?: number
}

/**
 * WP REST が返す tag.name は HTML コンテキスト用にエスケープされている（例: & → &amp;）。
 * UI・照合では実文字に戻す。
 */
export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
}
