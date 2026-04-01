import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { findFileById, getFilePath } from '@/lib/dataStorage'

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
    const filePath = getFilePath(meta.storedName)
    const buffer = await readFile(filePath)
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': meta.mimeType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(meta.originalName)}"`,
        'Content-Length': String(meta.size),
      },
    })
  } catch (e) {
    console.error('Download error:', e)
    return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  }
}
