import { NextResponse } from 'next/server'
import { writeFile } from 'fs/promises'
import {
  ensureUploadDir,
  addFile,
  getUploadDir,
} from '@/lib/dataStorage'
import path from 'path'

const MAX_SIZE = 100 * 1024 * 1024 // 100MB
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'application/javascript',
  'text/javascript',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
])

function getExt(mime: string, originalName: string): string {
  const fromName = path.extname(originalName)
  if (fromName) return fromName
  const map: Record<string, string> = {
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'text/plain': '.txt',
    'text/csv': '.csv',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
  }
  return map[mime] ?? ''
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file || typeof file === 'string') {
      return NextResponse.json(
        { error: 'ファイルを選択してください' },
        { status: 400 }
      )
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'ファイルサイズは100MBまでです' },
        { status: 400 }
      )
    }
    const mime = file.type || 'application/octet-stream'
    const allowed =
      ALLOWED_TYPES.has(mime) ||
      mime.startsWith('image/') ||
      mime.startsWith('video/') ||
      mime.startsWith('audio/') ||
      mime.startsWith('text/') ||
      mime.startsWith('application/')
    if (!allowed) {
      return NextResponse.json(
        { error: 'この形式のファイルはアップロードできません' },
        { status: 400 }
      )
    }
    await ensureUploadDir()
    const ext = getExt(mime, file.name)
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`
    const dir = getUploadDir()
    const filePath = path.join(dir, id)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(filePath, buffer)
    const meta = {
      id,
      originalName: file.name,
      storedName: id,
      mimeType: mime,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    }
    await addFile(meta)
    return NextResponse.json(meta)
  } catch (e) {
    console.error('Upload error:', e)
    return NextResponse.json(
      { error: 'アップロードに失敗しました' },
      { status: 500 }
    )
  }
}
