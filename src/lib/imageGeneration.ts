/**
 * 記事アイキャッチ画像の生成ロジック。
 * /api/image（ユーザー操作）と /api/auto-publish/run（自動投稿）から共有される。
 *
 * プロンプト決定の優先順位：
 *   1) 記事タイトル・本文があれば generateImagePromptFromArticle（Gemini）で 1 文英語プロンプトを得る
 *   2) 失敗時はアーキタイプのフォールバック文字列をランダム合成
 *   3) 最終的に appendScreenSafeSuffix で「画面内テキスト禁止」の安全語尾を必ず付与
 *
 * Bedrock の SD3.5 呼び出し部分はここに切り出したが、/api/image は既存コードの挙動を維持するため
 * 現時点でここの関数を呼ぶようには変更していない。将来 /api/image 側をこちらに寄せてもよい。
 */
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime'
import { generateImagePromptFromArticle } from '@/lib/api/gemini'

const BEDROCK_IMAGE_REGION = 'us-west-2'

export interface GeneratedImage {
  /** 画像バイナリ（生 Bytes） */
  buffer: Buffer
  /** 画像 MIME（現状 JPEG 固定） */
  mimeType: 'image/jpeg'
  /** SD に送った最終プロンプト（ログ用） */
  prompt: string
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!
}

/** SD3.5 に送る安全系ネガティブプロンプト（app/api/image/route.ts と同期して維持） */
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

const PROMPT_SCREEN_SAFE_SUFFIX =
  'minimalist composition, plenty of negative space, any screen must be blank or showing only soft bokeh, no legible text, no currency symbols, no dollar signs'

function appendScreenSafeSuffix(basePrompt: string): string {
  const t = basePrompt.trim().replace(/,+\s*$/, '')
  return `${t}, ${PROMPT_SCREEN_SAFE_SUFFIX}`
}

const FALLBACK_ARCHETYPES = [
  'soft pastel gradient background from pale pink to white, clean minimalist composition, abstract geometric shapes, bright airy mood, 16:9',
  'overhead view of clean wooden desk with laptop notebook and coffee cup, laptop screen out of frame or only a subtle soft reflection, soft natural window light, minimalist Japanese workspace, 16:9',
  'bright open field with blue sky and soft clouds, fresh green grass, wide open space, natural daylight, landscape, 16:9',
  'ascending wooden staircase in bright minimalist interior with window and greenery, growth metaphor, natural daylight, 16:9',
  'modern glass building exterior reflecting blue sky, upward angle, bright daylight, clean composition, 16:9',
  'single compass on wooden surface, soft golden bokeh background, direction concept, close-up macro, 16:9',
] as const

function buildFallbackPrompt(): string {
  return [
    pickRandom(FALLBACK_ARCHETYPES),
    'photorealistic stock photography, professional composition',
    'soft natural lighting, shallow depth of field, creamy bokeh',
    'bright airy optimistic mood, high key lighting',
  ].join(', ')
}

function getBedrockClient(): BedrockRuntimeClient {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim()
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS 認証情報が設定されていません（AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY）')
  }
  return new BedrockRuntimeClient({
    region: process.env.BEDROCK_REGION ?? BEDROCK_IMAGE_REGION,
    credentials: { accessKeyId, secretAccessKey },
  })
}

async function invokeSD35(
  prompt: string,
  negativePrompt: string,
): Promise<{ base64?: string; filterReason?: string }> {
  const client = getBedrockClient()
  const requestBody = {
    prompt,
    negative_prompt: negativePrompt,
    mode: 'text-to-image',
    aspect_ratio: '16:9',
    output_format: 'jpeg',
  }
  const command = new InvokeModelCommand({
    modelId: 'stability.sd3-5-large-v1:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: new TextEncoder().encode(JSON.stringify(requestBody)),
  })
  const response = await client.send(command)
  const parsed = JSON.parse(new TextDecoder().decode(response.body)) as {
    images?: string[]
    finish_reasons?: (string | null)[]
  }
  const reason = parsed.finish_reasons?.[0]
  if (reason != null && reason !== '') {
    return { filterReason: String(reason) }
  }
  const base64 = parsed.images?.[0]
  if (!base64) {
    throw new Error('画像データが返ってきませんでした')
  }
  return { base64 }
}

export interface GenerateArticleImageInput {
  title: string
  content: string
  /** 既定 2。安全フィルターで落ちた場合のリトライ回数 */
  maxRetries?: number
}

/**
 * 記事タイトル・本文から SD3.5 でアイキャッチ画像を 1 枚生成する。
 * コンテンツフィルターで落ちた場合は汎用フォールバック文にフォールバックして再試行する。
 */
export async function generateArticleImage(
  input: GenerateArticleImageInput,
): Promise<GeneratedImage> {
  const maxRetries = input.maxRetries ?? 2
  const title = input.title.trim()
  const trimmedContent = input.content.trim()

  let basePrompt: string
  try {
    basePrompt = await generateImagePromptFromArticle(title, trimmedContent)
  } catch (e) {
    console.warn('[imageGen] Gemini プロンプト失敗、フォールバック:', (e as Error)?.message)
    basePrompt = buildFallbackPrompt()
  }

  let lastFilterReason = ''
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const prompt = appendScreenSafeSuffix(attempt === 0 ? basePrompt : buildFallbackPrompt())
    console.log(`[imageGen] attempt ${attempt + 1}/${maxRetries} prompt=`, prompt.slice(0, 240))
    const result = await invokeSD35(prompt, SAFE_NEGATIVE_PROMPT)
    if (result.base64) {
      return {
        buffer: Buffer.from(result.base64, 'base64'),
        mimeType: 'image/jpeg',
        prompt,
      }
    }
    lastFilterReason = result.filterReason ?? 'unknown'
    console.warn(`[imageGen] filtered (reason=${lastFilterReason})`)
  }

  throw new Error(
    `コンテンツフィルターにより画像生成に失敗しました（last reason=${lastFilterReason}）`,
  )
}
