import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export async function POST(request: NextRequest) {
  try {
    const { keyword, volume, kd, category, relatedKeywords } = await request.json()

    if (!keyword?.trim()) {
      return NextResponse.json({ error: 'キーワードが必要です' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API Keyが設定されていません' }, { status: 500 })
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const relatedList = Array.isArray(relatedKeywords) && relatedKeywords.length > 0
      ? relatedKeywords.join(', ')
      : 'なし'

    const prompt = `あなたはSmart Boarding（スマートボーディング）／株式会社FCEの上級SEOコンテンツストラテジストです。

以下のAhrefsキーワードデータに基づいて、SEO記事の「一次執筆用プロンプト（執筆指示）」を生成してください。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【キーワードデータ】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ターゲットキーワード: ${keyword}
月間検索ボリューム: ${volume ?? '不明'}
競合難易度(KD): ${kd ?? '不明'}
カテゴリ: ${category ?? '不明'}
関連キーワード: ${relatedList}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【出力形式】※必ずこの形式で出力
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
プロンプト：
（ここに300〜500文字の執筆指示を出力）

以下の要素を含めること：
- このKWで検索するユーザーの想定ペルソナと検索意図
- 記事で解決すべきペイン（具体的に）
- 含めるべきポイント（3〜5つ、箇条書きで）
- Smart Boardingのサービス（法人向けオンライントレーニング×人財コンサルティング）をどう絡めるか
- 関連キーワードも自然に盛り込む指示

※プロンプト以外の説明や前置きは一切不要。「プロンプト：」の後の本文のみ出力。`

    const result = await model.generateContent(prompt)
    const text = result.response?.text() ?? ''

    const promptMatch = text.match(/プロンプト[：:]\s*([\s\S]+)/i)
    const suggestedPrompt = (promptMatch ? promptMatch[1] : text).trim()

    return NextResponse.json({
      targetKeyword: keyword,
      suggestedPrompt,
    })
  } catch (e) {
    console.error('Ahrefs suggest error:', e)
    const msg = e instanceof Error ? e.message : 'プロンプト生成に失敗しました'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
