'use client'

export interface SavedKeyword {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

const KEYWORDS_STORAGE_KEY = 'nas_user_keywords'

export function getAllKeywords(): SavedKeyword[] {
  if (typeof window === 'undefined') return []
  try {
    const data = localStorage.getItem(KEYWORDS_STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export function saveKeyword(
  keyword: Omit<SavedKeyword, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): SavedKeyword {
  const keywords = getAllKeywords()
  const now = new Date().toISOString()

  if (keyword.id) {
    const index = keywords.findIndex(k => k.id === keyword.id)
    if (index >= 0) {
      keywords[index] = {
        ...keywords[index],
        title: keyword.title,
        content: keyword.content,
        updatedAt: now,
      }
      localStorage.setItem(KEYWORDS_STORAGE_KEY, JSON.stringify(keywords))
      return keywords[index]!
    }
  }

  const newKeyword: SavedKeyword = {
    id: String(Date.now()),
    title: keyword.title,
    content: keyword.content,
    createdAt: now,
    updatedAt: now,
  }
  keywords.push(newKeyword)
  localStorage.setItem(KEYWORDS_STORAGE_KEY, JSON.stringify(keywords))
  return newKeyword
}

export function deleteKeyword(id: string): void {
  const keywords = getAllKeywords()
  const filtered = keywords.filter(k => k.id !== id)
  localStorage.setItem(KEYWORDS_STORAGE_KEY, JSON.stringify(filtered))
}
