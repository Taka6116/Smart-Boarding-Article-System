export interface SavedKeyword {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

export async function getAllKeywords(): Promise<SavedKeyword[]> {
  try {
    const res = await fetch('/api/keywords')
    if (!res.ok) return []
    const data = await res.json()
    return data.keywords ?? []
  } catch {
    return []
  }
}

export async function saveKeyword(
  keyword: Omit<SavedKeyword, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<SavedKeyword> {
  const now = new Date().toISOString()
  const saved: SavedKeyword = {
    id: keyword.id || String(Date.now()),
    title: keyword.title,
    content: keyword.content,
    createdAt: now,
    updatedAt: now,
  }

  if (keyword.id) {
    const existing = await getAllKeywords()
    const prev = existing.find(k => k.id === keyword.id)
    if (prev) {
      saved.createdAt = prev.createdAt
    }
  }

  const res = await fetch('/api/keywords', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(saved),
  })

  if (!res.ok) {
    throw new Error('キーワードの保存に失敗しました')
  }
  return saved
}

export async function deleteKeyword(id: string): Promise<void> {
  const res = await fetch('/api/keywords', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })

  if (!res.ok) {
    throw new Error('キーワードの削除に失敗しました')
  }
}
