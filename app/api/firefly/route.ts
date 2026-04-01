import { NextRequest, NextResponse } from 'next/server'
import { generateImageWithFirefly } from '@/lib/api/firefly'

export async function POST(request: NextRequest) {
  try {
    const { title, content } = await request.json()

    if (!title?.trim()) {
      return NextResponse.json(
        { error: 'タイトルが必要です' },
        { status: 400 }
      )
    }

    const imageUrl = await generateImageWithFirefly(title, content ?? '')
    return NextResponse.json({ imageUrl })
  } catch (error) {
    console.error('Imagen API error:', error)
    const message = error instanceof Error ? error.message : '画像生成に失敗しました'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
