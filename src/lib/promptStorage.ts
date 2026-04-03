export interface SavedPrompt {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

export async function getAllPrompts(): Promise<SavedPrompt[]> {
  try {
    const res = await fetch('/api/prompts')
    if (!res.ok) return []
    const data = await res.json()
    return data.prompts ?? []
  } catch {
    return []
  }
}

export async function savePrompt(
  prompt: Omit<SavedPrompt, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<SavedPrompt> {
  const now = new Date().toISOString()
  const saved: SavedPrompt = {
    id: prompt.id || String(Date.now()),
    title: prompt.title,
    content: prompt.content,
    createdAt: now,
    updatedAt: now,
  }

  if (prompt.id) {
    const existing = await getAllPrompts()
    const prev = existing.find(p => p.id === prompt.id)
    if (prev) {
      saved.createdAt = prev.createdAt
    }
  }

  const res = await fetch('/api/prompts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(saved),
  })

  if (!res.ok) {
    throw new Error('プロンプトの保存に失敗しました')
  }
  return saved
}

export async function deletePrompt(id: string): Promise<void> {
  const res = await fetch('/api/prompts', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })

  if (!res.ok) {
    throw new Error('プロンプトの削除に失敗しました')
  }
}
