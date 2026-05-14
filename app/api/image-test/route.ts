/**
 * 画像サムネイルのテスト専用エンドポイント。
 *
 * WordPress / S3 / DBへの書き込みは一切行わない。
 * Bedrock SD3.5 で画像を生成し、Base64 + 使用したプロンプト詳細を返すのみ。
 *
 * リクエスト body:
 *   title        : string  記事タイトル（必須）
 *   content      : string  本文スニペット（省略可）
 *   keyword      : string  ターゲットKW（省略可）
 *   archetypeId  : string  固定 archetype（省略時はローテーション決定）
 *   paletteId    : string  固定 palette（省略時はローテーション決定）
 *   useGemini    : boolean Gemini でプロンプトを生成するか（false でフォールバック直接）
 *
 * レスポンス:
 *   imageBase64  : string
 *   mimeType     : 'image/jpeg'
 *   prompt       : string  SD3.5 に送った最終プロンプト
 *   geminiPrompt : string  Gemini が返した生プロンプト（useGemini=true の場合）
 *   archetypeId  : string  実際に使用した archetype
 *   paletteId    : string  実際に使用した palette
 *   archetypeHint: string  archetype のシーン記述
 *   paletteHint  : string  palette の配色記述
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime'
import {
  IMAGE_ARCHETYPES,
  IMAGE_PALETTES,
  getArchetypeById,
  getPaletteById,
  pickImageRotationSlot,
} from '@/lib/imagePromptStyles'
import { generateImagePromptFromArticle } from '@/lib/api/gemini'

const BEDROCK_IMAGE_REGION = process.env.BEDROCK_REGION ?? 'us-west-2'

const SAFE_NEGATIVE_PROMPT = [
  'text, typography, watermark, logo, subtitle, caption',
  'readable text, legible numbers, gibberish letters, gibberish text, random letters',
  'carved letters on wood, alphabet blocks, letter cubes',
  'dollar sign, USD, euro sign, currency symbols',
  'English UI, roman alphabet on screen, fake interface text',
  'stock ticker, dashboard labels, HUD text, dashboards, charts, graphs',
  'cartoon, anime, illustration, painting, 3D render',
  'low quality, distorted, deformed, oversaturated',
  'cracked screen, broken LCD, glitch art, scan lines',
  'dark moody atmosphere, dramatic shadows, noir lighting',
  'neon colors, harsh fluorescent lighting',
  'extreme close-up of a face, identifiable celebrity, recognizable logo on clothing',
].join(', ')

const SCREEN_SAFE_SUFFIX =
  'any laptop, monitor, or phone screen must be blank or only showing soft bokeh, no legible text, no currency symbols, no dashboards'

function appendSuffix(prompt: string): string {
  return `${prompt.trim().replace(/,+\s*$/, '')}, ${SCREEN_SAFE_SUFFIX}`
}

async function invokeSD35(
  prompt: string,
): Promise<{ base64?: string; filterReason?: string }> {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim()
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS 認証情報が設定されていません（AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY）')
  }
  const client = new BedrockRuntimeClient({
    region: BEDROCK_IMAGE_REGION,
    credentials: { accessKeyId, secretAccessKey },
  })
  const body = JSON.stringify({
    prompt,
    negative_prompt: SAFE_NEGATIVE_PROMPT,
    mode: 'text-to-image',
    aspect_ratio: '16:9',
    output_format: 'jpeg',
  })
  const command = new InvokeModelCommand({
    modelId: 'stability.sd3-5-large-v1:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: new TextEncoder().encode(body),
  })
  const response = await client.send(command)
  const parsed = JSON.parse(new TextDecoder().decode(response.body)) as {
    images?: string[]
    finish_reasons?: (string | null)[]
  }
  const reason = parsed.finish_reasons?.[0]
  if (reason != null && reason !== '') return { filterReason: String(reason) }
  const base64 = parsed.images?.[0]
  if (!base64) throw new Error('画像データが返ってきませんでした')
  return { base64 }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSONが不正です' }, { status: 400 })
  }

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) {
    return NextResponse.json({ error: 'title は必須です' }, { status: 400 })
  }

  const content = typeof body.content === 'string' ? body.content.trim() : ''
  const keyword = typeof body.keyword === 'string' ? body.keyword.trim() : title
  const useGemini = body.useGemini !== false

  // archetype / palette を決定（指定があれば固定、なければローテーション）
  const seed = keyword || title
  const slot = pickImageRotationSlot(seed)
  const archetypeId =
    typeof body.archetypeId === 'string' && IMAGE_ARCHETYPES.some(a => a.id === body.archetypeId)
      ? (body.archetypeId as string)
      : slot.archetypeId
  const paletteId =
    typeof body.paletteId === 'string' && IMAGE_PALETTES.some(p => p.id === body.paletteId)
      ? (body.paletteId as string)
      : slot.paletteId

  const archetype = getArchetypeById(archetypeId)
  const palette = getPaletteById(paletteId)

  // Gemini でプロンプトを生成するか、フォールバックを使うか
  let geminiPrompt = ''
  let basePrompt: string

  if (useGemini && content) {
    try {
      geminiPrompt = await generateImagePromptFromArticle(title, content, { archetypeId, paletteId })
      basePrompt = geminiPrompt
    } catch (e) {
      console.warn('[image-test] Gemini失敗→フォールバック:', (e as Error)?.message)
      basePrompt = [archetype.sceneHint, palette.paletteHint, 'photorealistic 16:9 stock photography, soft natural lighting'].join(', ')
    }
  } else {
    basePrompt = [archetype.sceneHint, palette.paletteHint, 'photorealistic 16:9 stock photography, soft natural lighting'].join(', ')
  }

  const finalPrompt = appendSuffix(basePrompt)

  console.log('[image-test] archetype=', archetypeId, 'palette=', paletteId)
  console.log('[image-test] prompt=', finalPrompt.slice(0, 300))

  try {
    const result = await invokeSD35(finalPrompt)
    if (result.filterReason) {
      return NextResponse.json(
        { error: `コンテンツフィルターに引っかかりました: ${result.filterReason}`, prompt: finalPrompt },
        { status: 422 },
      )
    }
    return NextResponse.json({
      imageBase64: result.base64,
      mimeType: 'image/jpeg',
      prompt: finalPrompt,
      geminiPrompt: geminiPrompt || null,
      archetypeId,
      paletteId,
      archetypeHint: archetype.sceneHint,
      paletteHint: palette.paletteHint,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[image-test] Bedrock error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** archetype / palette 一覧を返す（UI の選択肢構築用） */
export async function GET() {
  return NextResponse.json({
    archetypes: IMAGE_ARCHETYPES.map(a => ({ id: a.id, label: a.label, sceneHint: a.sceneHint, peopleHint: a.peopleHint })),
    palettes: IMAGE_PALETTES.map(p => ({ id: p.id, label: p.label, paletteHint: p.paletteHint })),
  })
}
