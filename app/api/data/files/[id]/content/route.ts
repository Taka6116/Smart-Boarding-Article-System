import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { findFileById, getFilePath } from '@/lib/dataStorage'

const TEXT_MIMES = new Set([
  'text/plain',
  'text/csv',
  'text/html',
  'text/markdown',
  'application/json',
])

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const meta = await findFileById(id)
    if (!meta) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 })
    }
    const isText =
      TEXT_MIMES.has(meta.mimeType) ||
      meta.mimeType.startsWith('text/')
    if (!isText) {
      return NextResponse.json(
        {
          error:
            'このファイル形式は参照できません。テキストファイル（.txt など）をアップロードしてください。',
        },
        { status: 400 }
      )
    }
    const filePath = getFilePath(meta.storedName)
    const content = await readFile(filePath, 'utf-8')
    return NextResponse.json({
      content,
      originalName: meta.originalName,
    })
  } catch (e) {
    console.error('Content read error:', e)
    return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  }
}
