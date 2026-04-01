'use client'

import { useState, useEffect, useCallback } from 'react'
import { Upload, FileText, Trash2, Download, Film, File } from 'lucide-react'

interface StoredFileMeta {
  id: string
  originalName: string
  storedName: string
  mimeType: string
  size: number
  uploadedAt: string
  downloadUrl?: string
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getCategory(mime: string): 'document' | 'video' | 'image' | 'other' {
  if (mime.startsWith('video/') || mime.startsWith('audio/')) return 'video'
  if (mime.startsWith('image/')) return 'image'
  if (
    mime.includes('pdf') ||
    mime.includes('word') ||
    mime.includes('document') ||
    mime.includes('sheet') ||
    mime.includes('text')
  )
    return 'document'
  return 'other'
}

function CategoryIcon({ mime }: { mime: string }) {
  const cat = getCategory(mime)
  if (cat === 'video') return <Film className="text-[#64748B]" size={18} />
  if (cat === 'image') return <File className="text-[#64748B]" size={18} />
  return <FileText className="text-[#64748B]" size={18} />
}

export default function DataPage() {
  const [files, setFiles] = useState<StoredFileMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const fetchFiles = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/data/files')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '一覧の取得に失敗しました')
      setFiles(data.files ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '一覧の取得に失敗しました')
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  const handleUpload = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length || uploading) return
      setUploading(true)
      setError(null)
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i]
        const form = new FormData()
        form.append('file', file)
        try {
          const res = await fetch('/api/data/upload', {
            method: 'POST',
            body: form,
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'アップロードに失敗しました')
        } catch (e) {
          setError(e instanceof Error ? e.message : 'アップロードに失敗しました')
          break
        }
      }
      setUploading(false)
      fetchFiles()
    },
    [uploading, fetchFiles]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm('このファイルを削除しますか？')) return
      try {
        const res = await fetch(`/api/data/files?id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || '削除に失敗しました')
        await fetchFiles()
      } catch (e) {
        setError(e instanceof Error ? e.message : '削除に失敗しました')
      }
    },
    [fetchFiles]
  )

  return (
    <div className="w-full py-8">
      <h1 className="text-2xl font-bold text-[#1A1A2E] mb-1">
        資料の永久保存（専用ページ）
      </h1>
      <p className="text-sm text-[#64748B] mb-8">
        社内資料管理ページです。PDF、ドキュメント、スクリプト、動画などをアップロードし、アプリ上に保持します。
      </p>

      {/* アップロードエリア */}
      <div
        className={`
          relative rounded-xl border-2 border-dashed p-8 text-center transition-colors
          ${dragOver ? 'border-[#33B5E5] bg-[#F0F4FF]' : 'border-[#E2E8F0] bg-white'}
        `}
        onDragOver={e => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault()
          setDragOver(false)
          handleUpload(e.dataTransfer.files)
        }}
      >
        <input
          type="file"
          multiple
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={e => {
            handleUpload(e.target.files)
            e.target.value = ''
          }}
          disabled={uploading}
        />
        <Upload className="mx-auto text-[#94A3B8]" size={40} />
        <p className="mt-2 text-sm font-medium text-[#1A1A2E]">
          {uploading ? 'アップロード中...' : 'ファイルをドラッグ＆ドロップ、またはクリックして選択'}
        </p>
        <p className="mt-1 text-xs text-[#64748B]">
          PDF、Word、Excel、テキスト、動画、画像など（1ファイル100MBまで）
        </p>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* 一覧 */}
      <div className="mt-8">
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">保存済み資料一覧</h2>
        {loading ? (
          <p className="text-sm text-[#64748B]">読み込み中...</p>
        ) : files.length === 0 ? (
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center text-sm text-[#64748B]">
            まだアップロードされたファイルはありません。
          </div>
        ) : (
          <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                    <th className="text-left py-3 px-4 font-semibold text-[#64748B] w-10" />
                    <th className="text-left py-3 px-4 font-semibold text-[#64748B]">ファイル名</th>
                    <th className="text-left py-3 px-4 font-semibold text-[#64748B]">種類</th>
                    <th className="text-right py-3 px-4 font-semibold text-[#64748B]">サイズ</th>
                    <th className="text-left py-3 px-4 font-semibold text-[#64748B]">アップロード日時</th>
                    <th className="text-right py-3 px-4 font-semibold text-[#64748B] w-24">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map(f => (
                    <tr key={f.id} className="border-b border-[#E2E8F0] hover:bg-[#F8FAFC]/50">
                      <td className="py-3 px-4">
                        <CategoryIcon mime={f.mimeType} />
                      </td>
                      <td className="py-3 px-4 font-medium text-[#1A1A2E] truncate max-w-[280px]">
                        {f.originalName}
                      </td>
                      <td className="py-3 px-4 text-[#64748B]">
                        {f.mimeType.split('/')[0]}
                      </td>
                      <td className="py-3 px-4 text-right text-[#64748B]">
                        {formatSize(f.size)}
                      </td>
                      <td className="py-3 px-4 text-[#64748B]">
                        {formatDate(f.uploadedAt)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={f.downloadUrl ?? `/api/data/files/${encodeURIComponent(f.id)}/download`}
                            download={f.originalName}
                            className="p-2 rounded-lg text-[#64748B] hover:bg-[#E2E8F0] hover:text-[#1A9FCC] transition-colors"
                            title="ダウンロード"
                          >
                            <Download size={18} />
                          </a>
                          <button
                            type="button"
                            onClick={() => handleDelete(f.id)}
                            className="p-2 rounded-lg text-[#64748B] hover:bg-red-50 hover:text-red-600 transition-colors"
                            title="削除"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
