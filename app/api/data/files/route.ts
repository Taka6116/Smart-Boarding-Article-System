import { NextResponse } from 'next/server'
import { readMeta, removeFileById } from '@/lib/dataStorage'

export async function GET() {
  try {
    const files = await readMeta()
    const list = files.map(f => ({
      ...f,
      downloadUrl: `/api/data/files/${encodeURIComponent(f.id)}/download`,
    }))
    return NextResponse.json({ files: list })
  } catch (e) {
    console.error('List files error:', e)
    return NextResponse.json(
      { error: '一覧の取得に失敗しました' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id が必要です' }, { status: 400 })
    }
    const ok = await removeFileById(id)
    if (!ok) {
      return NextResponse.json({ error: 'ファイルが見つかりません' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Delete error:', e)
    return NextResponse.json(
      { error: '削除に失敗しました' },
      { status: 500 }
    )
  }
}
