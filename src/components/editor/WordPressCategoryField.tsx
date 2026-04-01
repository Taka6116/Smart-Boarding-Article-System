'use client'

import { useCallback, useEffect, useState } from 'react'
import { FolderOpen, RefreshCw, AlertCircle } from 'lucide-react'

interface WpCategory {
  id: number
  name: string
  slug: string
  count: number
}

interface WordPressCategoryFieldProps {
  selectedIds: number[]
  onChange: (ids: number[]) => void
}

export default function WordPressCategoryField({ selectedIds, onChange }: WordPressCategoryFieldProps) {
  const [categories, setCategories] = useState<WpCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCategories = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/wordpress/categories')
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'カテゴリー取得に失敗しました')
        return
      }
      setCategories(data.categories ?? [])
    } catch {
      setError('カテゴリー一覧の取得中にエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  const handleToggle = (id: number) => {
    if (selectedIds.includes(id)) {
      const next = selectedIds.filter(x => x !== id)
      onChange(next.length > 0 ? next : [id])
    } else {
      onChange([...selectedIds, id])
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[#94A3B8] py-2">
        <RefreshCw size={14} className="animate-spin" />
        カテゴリーを読み込み中…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-500 py-2">
        <AlertCircle size={14} />
        <span>{error}</span>
        <button
          type="button"
          onClick={fetchCategories}
          className="ml-2 text-[#1A9FCC] hover:underline text-xs"
        >
          再取得
        </button>
      </div>
    )
  }

  if (categories.length === 0) {
    return (
      <div className="text-sm text-[#94A3B8] py-2">
        カテゴリーが見つかりません
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <FolderOpen size={14} className="text-[#64748B]" />
        <span className="text-xs font-mono text-[#64748B]">カテゴリー（コラム）</span>
        <button
          type="button"
          onClick={fetchCategories}
          className="ml-auto text-xs text-[#1A9FCC] hover:underline flex items-center gap-1"
        >
          <RefreshCw size={11} />
          再取得
        </button>
      </div>
      <div className="rounded-lg border border-[#E2E8F0] bg-white p-3 max-h-[240px] overflow-y-auto">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {categories.map(cat => (
            <label
              key={cat.id}
              className="flex items-center gap-2 cursor-pointer hover:bg-[#F8FAFC] rounded px-1 py-0.5 transition-colors"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(cat.id)}
                onChange={() => handleToggle(cat.id)}
                className="w-4 h-4 rounded border-[#CBD5E1] text-[#33B5E5] focus:ring-[#33B5E5]/30 cursor-pointer"
              />
              <span className="text-sm text-[#1A1A2E] select-none">{cat.name}</span>
            </label>
          ))}
        </div>
      </div>
      {selectedIds.length === 0 && (
        <p className="text-xs text-amber-600 mt-1">少なくとも1つのカテゴリーを選択してください</p>
      )}
    </div>
  )
}
