import { NextRequest, NextResponse } from 'next/server'
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime'
import { generateImagePromptFromArticle } from '@/lib/api/gemini'

const BEDROCK_IMAGE_REGION = 'us-west-2'
const MAX_RETRIES = 2

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!
}

/* ─────────────────────────────────────────────────────────
 * Smart Boarding サムネイル画像アーキタイプ（SAFE版）
 * コンテンツフィルター回避のため人物要素を完全除外
 * ───────────────────────────────────────────────────────── */

const ARCH_PASTEL_BG = [
  'soft pastel gradient background from pale pink to white, clean minimalist composition, abstract geometric shapes, bright airy mood, 16:9',
  'gentle gradient from mint green to cream white, abstract soft bokeh circles, minimalist aesthetic, warm inviting mood, 16:9',
  'sky blue to lavender soft gradient, clean modern minimalist, faint geometric shapes, bright optimistic, 16:9',
  'warm peach to cream gradient with soft light flares, minimalist layout, abstract pastel shapes, bright hopeful, 16:9',
] as const

const ARCH_WORKSPACE = [
  'overhead view of clean wooden desk with laptop notebook and coffee cup, laptop screen out of frame or only a subtle soft reflection, soft natural window light, minimalist Japanese workspace, 16:9',
  'bright cafe table with open laptop angled so the display is a soft bokeh glow not readable, documents stacked without visible type, morning light, empty chair, 16:9',
  'modern desk with tablet propped with screen showing only blurred abstract pastel light, small potted plant, soft focus greenery background, bright airy mood, 16:9',
  'neat workspace near window with laptop and pen on wooden surface, calendar and papers turned blank side or edge-only, warm natural lighting, screen as gentle glow only, 16:9',
  'overhead flat-lay of notebook pen laptop coffee cup and succulent on white desk, laptop lid partly closed or screen a soft featureless blur, warm lighting, minimalist, 16:9',
] as const

const ARCH_CONCEPTUAL = [
  'empty straight road stretching to distant horizon under bright blue sky, journey concept, shallow focus, optimistic mood, 16:9',
  'vintage pocket watch on rustic wooden surface, soft pastel bokeh background, warm natural light, close-up macro, 16:9',
  'ascending wooden staircase in bright minimalist interior with window and greenery, growth metaphor, natural daylight, 16:9',
  'single compass on wooden surface, soft golden bokeh background, direction concept, close-up macro, 16:9',
  'morning sunlight streaming through window onto empty desk with coffee cup, warm golden tones, minimalist, 16:9',
  'open book with fountain pen on wooden table near window, natural light, soft focus, warm atmosphere, 16:9',
] as const

const ARCH_NATURE = [
  'bright open field with blue sky and soft clouds, fresh green grass, wide open space, natural daylight, landscape, 16:9',
  'sunny park pathway with trees and dappled sunlight, bright optimistic mood, shallow depth of field, 16:9',
  'modern glass building exterior reflecting blue sky, upward angle, bright daylight, clean composition, 16:9',
  'peaceful lake horizon under bright sky, calm water surface, tranquility concept, natural light, minimalist, 16:9',
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

/**
 * 無害なワードのみで構成されたネガティブプロンプト
 * フィルタートリガーになりうるワード（nsfw, cleavage, exposed skin 等）は完全排除
 */
const SAFE_NEGATIVE_PROMPT = [
  'text, typography, watermark, logo, subtitle, caption',
  'readable text, legible numbers, gibberish letters, gibberish text, random letters',
  'carved letters on wood, alphabet blocks, letter cubes',
  'dollar sign, USD, euro sign, currency symbols',
  'English UI, roman alphabet on screen, fake interface text',
  'stock ticker, dashboard labels, HUD text',
  'cartoon, anime, illustration, painting, 3D render',
  'low quality, distorted, deformed, oversaturated',
  'cracked screen, broken LCD, glitch art, scan lines',
  'dark moody atmosphere, dramatic shadows, noir lighting',
  'neon colors, harsh fluorescent lighting',
].join(', ')

/** 全プロンプトに付与するダメ押し（画面の英語・通貨・判読可能文字の抑制） */
const PROMPT_SCREEN_SAFE_SUFFIX =
  'minimalist composition, plenty of negative space, any screen must be blank or showing only soft bokeh, no legible text, no currency symbols, no dollar signs'

function appendScreenSafeSuffix(basePrompt: string): string {
  const t = basePrompt.trim().replace(/,+\s*$/, '')
  return `${t}, ${PROMPT_SCREEN_SAFE_SUFFIX}`
}

/**
 * Bedrock SD3.5 に画像生成リクエストを送信する
 * finish_reasons を返すので呼び出し側でリトライ判定可能
 */
async function invokeSD35(
  prompt: string,
  negativePrompt: string,
): Promise<{ base64?: string; filterReason?: string }> {
  const requestBody = {
    prompt,
    negative_prompt: negativePrompt,
    mode: 'text-to-image',
    aspect_ratio: '16:9',
    output_format: 'jpeg',
  }

  console.log('[IMAGE] === Bedrock SD3.5 Request ===')
  console.log('[IMAGE] prompt:', prompt.slice(0, 300), prompt.length > 300 ? '...' : '')
  console.log('[IMAGE] negative_prompt:', negativePrompt.slice(0, 200))

  const bodyBytes = new TextEncoder().encode(JSON.stringify(requestBody))
  const command = new InvokeModelCommand({
    modelId: 'stability.sd3-5-large-v1:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: bodyBytes,
  })

  const client = getBedrockClient()
  const response = await client.send(command)
  const responseBody = JSON.parse(
    new TextDecoder().decode(response.body),
  ) as { images?: string[]; finish_reasons?: (string | null)[] }

  const reason = responseBody.finish_reasons?.[0]
  console.log('[IMAGE] finish_reasons:', JSON.stringify(responseBody.finish_reasons))

  if (reason != null && reason !== '') {
    console.warn('[IMAGE] FILTERED — reason:', reason)
    return { filterReason: String(reason) }
  }

  const base64 = responseBody.images?.[0]
  if (!base64) {
    throw new Error('画像データが返ってきませんでした')
  }
  return { base64 }
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
      { status: 400 },
    )
  }

  if (!title?.trim()) {
    return NextResponse.json(
      { error: 'タイトルが必要です' },
      { status: 400 },
    )
  }

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim()
  if (!accessKeyId || !secretAccessKey) {
    return NextResponse.json(
      { error: 'AWS認証情報が設定されていません。.env.local を確認してください。' },
      { status: 500 },
    )
  }

  /* --- プロンプト生成 --- */
  let prompt: string
  const trimmedContent = content?.trim()
  if (title.trim() && trimmedContent) {
    try {
      const geminiPrompt = await generateImagePromptFromArticle(title.trim(), trimmedContent)
      prompt = [
        geminiPrompt,
        'photorealistic stock photography, shallow depth of field, bright airy mood',
        'soft natural lighting, pastel or warm earth tones, horizontal 16:9',
      ].join(', ')
    } catch (e) {
      console.warn('[IMAGE] Gemini prompt failed, using fallback:', (e as Error)?.message)
      prompt = buildPrompt()
    }
  } else {
    prompt = buildPrompt()
  }

  /* --- リトライ付き画像生成 --- */
  let lastFilterReason = ''
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const basePrompt = attempt === 0 ? prompt : buildPrompt()
    const currentPrompt = appendScreenSafeSuffix(basePrompt)
    const currentNegative = SAFE_NEGATIVE_PROMPT

    console.log(`[IMAGE] Attempt ${attempt + 1}/${MAX_RETRIES}`)

    try {
      const result = await invokeSD35(currentPrompt, currentNegative)

      if (result.base64) {
        console.log('[IMAGE] Success on attempt', attempt + 1)
        return NextResponse.json({
          imageBase64: result.base64,
          mimeType: 'image/jpeg',
          prompt: currentPrompt,
        })
      }

      lastFilterReason = result.filterReason ?? 'unknown'
      console.warn(`[IMAGE] Filtered on attempt ${attempt + 1}: ${lastFilterReason}`)

    } catch (error) {
      const err = error as Error & { name?: string; $metadata?: unknown; Code?: string }
      console.error('[IMAGE] Bedrock error:', err?.message ?? error)
      if (error && typeof error === 'object') {
        console.error('[IMAGE]   name:', err?.name)
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

  return NextResponse.json(
    {
      error: 'コンテンツフィルターにより画像が生成されませんでした。プロンプトを変えて再試行してください。',
      debug: process.env.NODE_ENV === 'development' ? `filter_reason: ${lastFilterReason}` : undefined,
    },
    { status: 500 },
  )
}

function buildPrompt(): string {
  const safePool = [
    ...ARCH_PASTEL_BG,
    ...ARCH_WORKSPACE,
    ...ARCH_CONCEPTUAL,
    ...ARCH_NATURE,
  ]
  const theme = pickRandom(safePool)

  return [
    theme,
    'photorealistic stock photography, professional composition',
    'soft natural lighting, shallow depth of field, creamy bokeh',
    'bright airy optimistic mood, high key lighting',
    'pastel or warm earth tones',
  ].join(', ')
}
