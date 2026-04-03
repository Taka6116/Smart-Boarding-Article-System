'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import { SavedPrompt, getAllPrompts, savePrompt, deletePrompt } from '@/lib/promptStorage'
import Button from '@/components/ui/Button'

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<SavedPrompt[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SavedPrompt | null>(null)
  const [saving, setSaving] = useState(false)

  const loadPrompts = useCallback(async () => {
    const data = await getAllPrompts()
    setPrompts(data)
  }, [])

  useEffect(() => {
    loadPrompts().then(() => setMounted(true))
  }, [loadPrompts])

  if (!mounted) return null

  const handleCreateNew = () => {
    setIsCreating(true)
    setEditingId(null)
    setEditTitle('')
    setEditContent('')
  }

  const handleEdit = (p: SavedPrompt) => {
    setIsCreating(false)
    setEditingId(p.id)
    setEditTitle(p.title)
    setEditContent(p.content)
  }

  const handleCancel = () => {
    setIsCreating(false)
    setEditingId(null)
  }

  const handleSave = async () => {
    if (!editTitle.trim() || !editContent.trim() || saving) return
    setSaving(true)
    try {
      await savePrompt({
        id: editingId || undefined,
        title: editTitle.trim(),
        content: editContent.trim(),
      })
      await loadPrompts()
      setIsCreating(false)
      setEditingId(null)
    } catch {
      /* toast could be added later */
    } finally {
      setSaving(false)
    }
  }

  const handleRequestDelete = (p: SavedPrompt) => {
    setDeleteTarget(p)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await deletePrompt(deleteTarget.id)
      await loadPrompts()
      if (editingId === deleteTarget.id) {
        setEditingId(null)
        setIsCreating(false)
      }
    } catch {
      /* toast could be added later */
    }
    setDeleteTarget(null)
  }

  const handleCloseDeleteModal = () => {
    setDeleteTarget(null)
  }

  const isEditorOpen = isCreating || editingId !== null

  return (
    <div className="w-full py-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A2E] mb-2">プロンプトライブラリ</h1>
          <p className="text-sm text-[#64748B]">
            よく使うプロンプトを保存して、一次執筆でいつでも呼び出せるように管理します。
          </p>
        </div>
        {!isEditorOpen && (
          <Button variant="primary" onClick={handleCreateNew}>
            <Plus size={18} className="mr-2" />
            プロンプトを追加
          </Button>
        )}
      </div>

      {isEditorOpen && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#1A1A2E]">
              {isCreating ? '新しいプロンプト' : 'プロンプトを編集'}
            </h2>
            <button onClick={handleCancel} className="text-[#64748B] hover:text-[#1A1A2E]">
              <X size={20} />
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[#1A1A2E] mb-1.5">
                プロンプト名（用途など）
              </label>
              <input
                type="text"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                placeholder="例：導入事例インタビュー用"
                className="w-full px-4 py-2.5 rounded-lg border border-[#E2E8F0] focus:ring-2 focus:ring-[#1A9FCC]/30 focus:border-[#1A9FCC] outline-none transition-all text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1A1A2E] mb-1.5">
                プロンプト本文
              </label>
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                placeholder="Geminiへの指示内容を入力してください"
                className="w-full px-4 py-3 rounded-lg border border-[#E2E8F0] focus:ring-2 focus:ring-[#1A9FCC]/30 focus:border-[#1A9FCC] outline-none transition-all text-sm resize-y min-h-[200px]"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={handleCancel}>キャンセル</Button>
              <Button
                variant="primary"
                disabled={!editTitle.trim() || !editContent.trim() || saving}
                onClick={handleSave}
              >
                <Check size={18} className="mr-2" />
                {saving ? '保存中...' : '保存する'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {prompts.length === 0 && !isEditorOpen ? (
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-12 text-center text-[#64748B]">
            保存されているプロンプトはありません。
          </div>
        ) : (
          prompts.map(p => (
            <div key={p.id} className="bg-white border border-[#E2E8F0] rounded-xl p-5 hover:border-[#CBD5E1] transition-all group">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0 pr-4">
                  <h3 className="font-bold text-[#1A1A2E] text-base mb-2">{p.title}</h3>
                  <p className="text-sm text-[#64748B] whitespace-pre-wrap line-clamp-3">
                    {p.content}
                  </p>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleEdit(p)}
                    className="p-2 text-[#64748B] hover:text-[#1A9FCC] hover:bg-[#F1F5F9] rounded-lg transition-colors"
                    title="編集"
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    onClick={() => handleRequestDelete(p)}
                    className="p-2 text-[#64748B] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="削除"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-[#1A1A2E] mb-1">
                  このプロンプトを削除しますか？
                </h2>
                <p className="text-xs text-[#64748B]">
                  {`「${deleteTarget.title.slice(0, 30)}${deleteTarget.title.length > 30 ? '…' : ''}」を削除します。よろしいですか？`}
                </p>
              </div>
              <button
                onClick={handleCloseDeleteModal}
                className="text-[#94A3B8] hover:text-[#1A1A2E]"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={handleCloseDeleteModal}>
                キャンセル
              </Button>
              <Button variant="primary" onClick={handleConfirmDelete}>
                削除する
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
