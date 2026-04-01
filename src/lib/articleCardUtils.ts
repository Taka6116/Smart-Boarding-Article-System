import type { SavedArticle } from './types'

export const ARTICLE_CARD_PAGE_SIZE = 9
export const ARTICLE_CARD_EXCERPT_MAX = 140

export function formatCreatedDots(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`
}

export function buildArticleExcerpt(article: SavedArticle): string {
  const raw = (article.refinedContent || article.originalContent || '').replace(/\s+/g, ' ').trim()
  if (raw.length <= ARTICLE_CARD_EXCERPT_MAX) return raw
  return raw.slice(0, ARTICLE_CARD_EXCERPT_MAX).trim() + '…'
}
