import { NextRequest, NextResponse } from 'next/server'
import { refineArticleWithGemini, generateSlugFromGemini } from '@/lib/api/gemini'

export async function POST(request: NextRequest) {
  try {
    const { title, content, targetKeyword } = await request.json()
    const titleStr = typeof title === 'string' ? title : ''
    const targetKeywordStr = typeof targetKeyword === 'string' ? targetKeyword : undefined

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: '記事本文が必要です' },
        { status: 400 }
      )
    }

    const { refinedTitle, refinedContent } = await refineArticleWithGemini(
      titleStr,
      content,
      targetKeywordStr
    )
    const slug = await generateSlugFromGemini(
      refinedTitle || titleStr,
      targetKeywordStr,
      refinedContent
    )
    return NextResponse.json({ refinedTitle, refinedContent, slug })
  } catch (error) {
    console.error('Gemini API error:', error)
    const message =
      error instanceof Error ? error.message : 'Gemini APIの呼び出しに失敗しました'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
