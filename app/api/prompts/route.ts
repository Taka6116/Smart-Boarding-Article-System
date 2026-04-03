import { NextRequest, NextResponse } from 'next/server'
import { listS3Objects, getS3ObjectAsText, putS3Object, deleteS3Object } from '@/lib/s3Reference'

export const dynamic = 'force-dynamic'

const PREFIX = 'prompts/'

interface SavedPromptS3 {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

function promptKey(id: string): string {
  return `${PREFIX}${id}.json`
}

export async function GET() {
  try {
    const objects = await listS3Objects(PREFIX)
    const jsonFiles = objects.filter(o => o.key.endsWith('.json'))

    const prompts: SavedPromptS3[] = []
    for (const obj of jsonFiles) {
      const result = await getS3ObjectAsText(obj.key)
      if (result) {
        try {
          prompts.push(JSON.parse(result.content) as SavedPromptS3)
        } catch { /* skip malformed */ }
      }
    }

    prompts.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    return NextResponse.json({ prompts })
  } catch (e) {
    console.error('Prompts GET error:', e)
    return NextResponse.json({ error: 'プロンプト一覧の取得に失敗しました' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const prompt = (await request.json()) as SavedPromptS3
    if (!prompt.id) {
      return NextResponse.json({ error: 'プロンプトIDが必要です' }, { status: 400 })
    }

    const ok = await putS3Object(promptKey(prompt.id), JSON.stringify(prompt))
    if (!ok) {
      return NextResponse.json({ error: 'S3への保存に失敗しました' }, { status: 500 })
    }
    return NextResponse.json({ success: true, id: prompt.id })
  } catch (e) {
    console.error('Prompts POST error:', e)
    return NextResponse.json({ error: 'プロンプトの保存に失敗しました' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = (await request.json()) as { id: string }
    if (!id) {
      return NextResponse.json({ error: 'プロンプトIDが必要です' }, { status: 400 })
    }

    const ok = await deleteS3Object(promptKey(id))
    if (!ok) {
      return NextResponse.json({ error: 'S3からの削除に失敗しました' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Prompts DELETE error:', e)
    return NextResponse.json({ error: 'プロンプトの削除に失敗しました' }, { status: 500 })
  }
}
