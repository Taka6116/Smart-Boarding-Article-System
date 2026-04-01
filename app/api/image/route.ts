import { NextRequest, NextResponse } from 'next/server'
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime'
import { generateImagePromptFromArticle } from '@/lib/api/gemini'

/** Stable Diffusion 3.5 は us-west-2 でのみ利用可能 */
const BEDROCK_IMAGE_REGION = 'us-west-2'

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!
}

/* ─────────────────────────────────────────────────────────
 * Smart Boarding サムネイル画像アーキタイプ（SAFE版）
 * コンテンツフィルター回避のため人物要素を完全除外
 * 抽象的・物体のみの表現で多様性を確保
 * ───────────────────────────────────────────────────────── */

/** パターンA: パステルグラデーション背景（人物シルエットなし） */
const ARCH_PASTEL_BG = [
  'soft pastel gradient background from pale pink to white, clean minimalist composition with large empty center space, abstract geometric shapes, bright airy mood, lifestyle stock photography, 16:9',
  'gentle gradient background from mint green to cream white, abstract soft bokeh circles, minimalist corporate lifestyle aesthetic, warm inviting mood, professional stock photo, 16:9',
  'sky blue to lavender soft gradient background, clean modern minimalist composition, faint abstract geometric shapes, bright and optimistic, professional lifestyle photography, 16:9',
  'warm peach to cream gradient background with soft light flares, minimalist clean layout, abstract pastel shapes, bright hopeful mood, lifestyle stock aesthetic, 16:9',
] as const

/** パターンB: デスク・ワークスペース（人物完全除外） */
const ARCH_WORKSPACE = [
  'overhead view of clean wooden desk with laptop, notebook and coffee cup, soft natural window light, minimalist productive workspace, no people, lifestyle stock photography',
  'bright cafe table with open laptop and documents, morning light streaming through window, cozy atmosphere, empty chair visible, no people, 16:9',
  'modern desk with tablet device and small potted plant, soft focus background with greenery and window light, bright airy mood, no people, professional lifestyle shot',
  'neat workspace near window with laptop, pen and planning calendar on wooden surface, warm natural lighting, no people, 16:9',
  'overhead flat-lay of notebook, pen, laptop, coffee cup and small succulent plant on clean white desk, warm natural lighting, minimalist workspace, no people, lifestyle stock photo',
] as const

/** パターンC: 抽象・概念的メタファー（物体のみ） */
const ARCH_CONCEPTUAL = [
  'empty straight road stretching to distant horizon under bright blue sky with scattered clouds, journey and decision concept, shallow focus on road surface, natural sunlit landscape, optimistic mood, no people, lifestyle photography',
  'vintage pocket watch on rustic wooden surface, extremely soft pastel bokeh background, time management concept, warm natural light, close-up macro, no people, lifestyle photography aesthetic',
  'ascending bright wooden staircase in modern minimalist interior with large window and greenery, growth metaphor, natural daylight flooding in, clean airy composition, no people',
  'single compass on rustic wooden surface, soft bokeh background with warm golden light, direction and purpose concept, close-up macro, no people, lifestyle stock photo aesthetic',
  'morning sunlight streaming through large window onto empty wooden desk with single coffee cup, new day fresh start concept, warm golden tones, minimalist clean composition, no people',
  'open book with fountain pen on wooden table near window, natural light, learning and knowledge concept, soft focus, warm atmosphere, no people, 16:9',
] as const

/** パターンD: ナチュラル・屋外風景 */
const ARCH_NATURE = [
  'bright open field with blue sky and soft clouds, fresh green grass, wide open space, freedom and possibility concept, natural daylight, no people, landscape photography',
  'sunny park pathway with trees and dappled sunlight, inviting forward journey, bright optimistic mood, shallow depth of field, no people, lifestyle photography',
  'modern glass building exterior reflecting blue sky, upward angle, aspirational corporate architecture, bright daylight, no people, clean composition',
  'peaceful lake or ocean horizon under bright sky, calm water surface, tranquility and clarity concept, natural light, no people, minimalist landscape',
] as const

function getBedrockClient(): BedrockRuntimeClient {
  return new BedrockRuntimeClient({
    region: process.env.BEDROCK_REGION ?? BEDROCK_IMAGE_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  })
}

export async function POST(request: NextRequest) {
  let title: string | undefined
  let content: string | undefined
  let targetKeyword: string | undefined
  try {
    const body = await request.json()
    title = body?.title
    content = typeof body?.content === 'string' ? body.content : undefined
    targetKeyword = body?.targetKeyword
  } catch {
    return NextResponse.json(
      { error: 'リクエスト body の JSON が不正です。' },
      { status: 400 }
    )
  }

  if (!title?.trim()) {
    return NextResponse.json(
      { error: 'タイトルが必要です' },
      { status: 400 }
    )
  }

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim()
  if (!accessKeyId || !secretAccessKey) {
    return NextResponse.json(
      { error: 'AWS認証情報（AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY）が設定されていません。.env.local と Vercel の環境変数を確認してください。' },
      { status: 500 }
    )
  }

  let prompt: string
  const trimmedContent = content?.trim()
  if (title.trim() && trimmedContent) {
    try {
      prompt = await generateImagePromptFromArticle(title.trim(), trimmedContent)
      prompt = [
        prompt,
        'Lifestyle stock photography aesthetic similar to Unsplash or Adobe Stock',
        'High quality photorealistic with shallow depth of field and creamy bokeh',
        'Bright airy optimistic mood with soft natural lighting or golden hour glow',
        'Pastel gradient tones or natural warm earth tones',
        'CRITICAL: no people no faces no human figures no silhouettes no hands no body parts',
        'No readable text numbers logos or watermarks anywhere',
        'Horizontal 16:9',
      ].join(', ')
    } catch (e) {
      console.warn('Gemini image prompt failed, using fallback:', (e as Error)?.message)
      prompt = buildPrompt(title, typeof targetKeyword === 'string' ? targetKeyword : undefined)
    }
  } else {
    prompt = buildPrompt(title, typeof targetKeyword === 'string' ? targetKeyword : undefined)
  }

  const requestBody = {
    prompt,
    negative_prompt: [
      'person, people, human, man, woman, child, figure, silhouette, body',
      'face, head, eyes, nose, mouth, portrait, headshot, selfie',
      'hands, arms, legs, feet, fingers, skin, hair',
      'business person, professional, worker, employee, team member',
      'direct camera-facing portrait, beauty glamor model shot',
      'revealing clothing, cleavage, exposed skin, inappropriate',
      'western faces, caucasian, blonde',
      'formal dark suit, stiff corporate conference room, boardroom',
      'text, typography, watermark, logo, subtitle, caption',
      'readable text, legible numbers, gibberish letters, random letters, floating letters',
      'carved letters on wood, alphabet blocks, letter cubes, engraved symbols',
      'garbled UI text, meaningless digits on paper, newspaper headline',
      'cartoon, anime, illustration, painting, 3D render',
      'low quality, blurry, distorted, deformed, oversaturated',
      'dark moody atmosphere, dramatic shadows, noir lighting',
      'bright neon colors, harsh fluorescent lighting',
      'nsfw, adult content',
      'extra fingers, missing fingers, fused fingers, deformed hands, mutated hands',
      'six fingers, too many fingers, bad hands, malformed hands, extra limbs',
    ].join(', '),
    mode: 'text-to-image',
    aspect_ratio: '16:9',
    output_format: 'jpeg',
  }

  const bodyBytes = new TextEncoder().encode(JSON.stringify(requestBody))

  try {
    const command = new InvokeModelCommand({
      modelId: 'stability.sd3-5-large-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: bodyBytes,
    })

    const client = getBedrockClient()
    const response = await client.send(command)
    const responseBody = JSON.parse(
      new TextDecoder().decode(response.body)
    ) as { images?: string[]; finish_reasons?: (string | null)[] }

    const reason = responseBody.finish_reasons?.[0]
    if (reason != null && reason !== '') {
      throw new Error(
        'コンテンツフィルターにより画像が生成されませんでした。プロンプトを変えて再試行してください。'
      )
    }

    const base64Image = responseBody.images?.[0]
    if (!base64Image) {
      throw new Error('画像データが返ってきませんでした')
    }

    return NextResponse.json({
      imageBase64: base64Image,
      mimeType: 'image/jpeg',
      prompt,
    })
  } catch (error) {
    const err = error as Error & { name?: string; $metadata?: unknown; Code?: string }
    console.error('Bedrock image error:', err?.message ?? error)
    if (error && typeof error === 'object') {
      console.error('  name:', err?.name)
      console.error('  $metadata:', (error as Record<string, unknown>).$metadata)
      console.error('  Code:', (error as Record<string, unknown>).Code)
    }
    let message = '画像生成に失敗しました'
    const errName = err?.name ?? (error as Record<string, unknown>)?.Code ?? ''
    const errMessage = err?.message ?? String(error)
    if (errName === 'AccessDeniedException') {
      message = 'Bedrock の利用権限がありません。IAM に bedrock:InvokeModel を追加してください。'
    } else if (errName === 'ResourceNotFoundException') {
      message = '指定したモデル（stability.sd3-5-large-v1:0）が見つかりません。us-west-2 でモデルアクセスを有効にしてください。'
    } else if (errMessage) {
      message = errMessage
    }
    const body: { error: string; debug?: string } = { error: message }
    if (process.env.NODE_ENV === 'development' && errMessage && errMessage !== message) {
      body.debug = errMessage
    }
    return NextResponse.json(body, { status: 500 })
  }
}

function buildPrompt(title: string, targetKeyword?: string): string {
  // 全てのケースで人物を含まない安全なプールからランダム選択
  const safePool = [
    ...ARCH_PASTEL_BG,
    ...ARCH_WORKSPACE,
    ...ARCH_CONCEPTUAL,
    ...ARCH_NATURE,
  ]
  
  const theme = pickRandom(safePool)

  return [
    theme,
    'lifestyle stock photography aesthetic similar to Unsplash or Adobe Stock',
    'photorealistic high quality with professional composition',
    'soft natural window lighting or golden hour glow',
    'shallow depth of field with creamy bokeh',
    'bright airy optimistic mood with high key lighting',
    'pastel gradient tones or natural warm earth tones',
    'no people no faces no human figures no silhouettes',
    'no hands no arms no body parts',
    'no readable text no watermark no logo',
    'horizontal 16:9 composition',
  ].join(', ')
}
