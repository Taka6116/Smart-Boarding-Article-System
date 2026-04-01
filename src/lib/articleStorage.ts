import { SavedArticle } from './types'

const API_BASE = '/api/articles'

export async function getAllArticles(): Promise<SavedArticle[]> {
  try {
    const res = await fetch(API_BASE)
    if (!res.ok) throw new Error(`GET ${res.status}`)
    const data = await res.json()
    return data.articles ?? []
  } catch (e) {
    console.error('getAllArticles error:', e)
    return []
  }
}

export async function saveArticle(article: SavedArticle): Promise<void> {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(article),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || '記事の保存に失敗しました')
  }
}

export async function deleteArticle(id: string): Promise<void> {
  const res = await fetch(API_BASE, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || '記事の削除に失敗しました')
  }
}

export async function getArticleById(id: string): Promise<SavedArticle | null> {
  const all = await getAllArticles()
  return all.find(a => a.id === id) ?? null
}

export async function updateArticleStatus(
  id: string,
  status: SavedArticle['status'],
  wordpressUrl?: string,
  wordpressPostStatus?: string
): Promise<void> {
  const article = await getArticleById(id)
  if (!article) return
  article.status = status
  if (wordpressUrl) article.wordpressUrl = wordpressUrl
  if (wordpressPostStatus !== undefined) article.wordpressPostStatus = wordpressPostStatus
  await saveArticle(article)
}
