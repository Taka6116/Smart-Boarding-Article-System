'use client'

export interface SavedPrompt {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

const PROMPTS_STORAGE_KEY = 'nas_user_prompts'

export function getAllPrompts(): SavedPrompt[] {
  if (typeof window === 'undefined') return []
  try {
    const data = localStorage.getItem(PROMPTS_STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export function savePrompt(prompt: Omit<SavedPrompt, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): SavedPrompt {
  const prompts = getAllPrompts()
  const now = new Date().toISOString()

  if (prompt.id) {
    const index = prompts.findIndex(p => p.id === prompt.id)
    if (index >= 0) {
      prompts[index] = {
        ...prompts[index],
        title: prompt.title,
        content: prompt.content,
        updatedAt: now,
      }
      localStorage.setItem(PROMPTS_STORAGE_KEY, JSON.stringify(prompts))
      return prompts[index]
    }
  }

  const newPrompt: SavedPrompt = {
    id: String(Date.now()),
    title: prompt.title,
    content: prompt.content,
    createdAt: now,
    updatedAt: now,
  }
  prompts.push(newPrompt)
  localStorage.setItem(PROMPTS_STORAGE_KEY, JSON.stringify(prompts))
  return newPrompt
}

export function deletePrompt(id: string): void {
  const prompts = getAllPrompts()
  const filtered = prompts.filter(p => p.id !== id)
  localStorage.setItem(PROMPTS_STORAGE_KEY, JSON.stringify(filtered))
}
