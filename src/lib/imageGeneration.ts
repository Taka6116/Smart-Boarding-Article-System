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
import {
  IMAGE_ARCHETYPES,
  getArchetypeById,
  getPaletteById,
  nextArchetypeIdAfter,
  pickImageRotationSlot,
  type ImageRotationSlot,
} from '@/lib/imagePromptStyles'

const BEDROCK_IMAGE_REGION = 'us-west-2'

export interface GeneratedImage {
  /** 画像バイナリ（生 Bytes） */
  buffer: Buffer
  /** 画像 MIME（現状 JPEG 固定） */
  mimeType: 'image/jpeg'
  /** SD に送った最終プロンプト（ログ用） */
  prompt: string
  /** ローテーションで実際に採用された archetype/palette（デバッグ用） */
  rotation: ImageRotationSlot
}

/**
 * SD3.5 に送る安全系ネガティブプロンプト（app/api/image/route.ts と同期して維持）。
 * 人物そのものは禁止しないが、顔の極端なクローズアップ・特定個人の特徴・ロゴ等は避ける。
 */
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

const PROMPT_SCREEN_SAFE_SUFFIX =
  'any laptop, monitor, or phone screen must be blank or only showing soft bokeh, no legible text, no currency symbols, no dashboards'

function appendScreenSafeSuffix(basePrompt: string): string {
  const t = basePrompt.trim().replace(/,+\s*$/, '')
  return `${t}, ${PROMPT_SCREEN_SAFE_SUFFIX}`
}

/**
 * フォールバック（Gemini プロンプト生成失敗時）に使う 1 文プロンプトを、
 * 指定された archetype / palette から組み立てる。
 * archetype 配列の順序は IMAGE_ARCHETYPES と一致しており、リトライで次のスロットへ進められる。
 */
function buildFallbackPromptFromSlot(slot: ImageRotationSlot): string {
  const arch = getArchetypeById(slot.archetypeId)
  const pal = getPaletteById(slot.paletteId)
  return [
    arch.sceneHint,
    pal.paletteHint,
    'photorealistic 16:9 stock photography, soft natural lighting, shallow depth of field, calm professional mood',
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
  /**
   * ローテーションスロット決定用のシード。通常はターゲットKWを渡す。
   * 未指定の場合はタイトル+本文先頭から自動生成。
   */
  rotationSeed?: string
  /** 既定 IMAGE_ARCHETYPES.length。安全フィルターで落ちた場合のリトライ回数（毎回 archetype を進める） */
  maxRetries?: number
}

/**
 * 記事タイトル・本文から SD3.5 でアイキャッチ画像を 1 枚生成する。
 *
 * 1. シード（ターゲットKWまたはタイトル）と現在日時から archetype/palette を決定的にローテーション
 * 2. Gemini に archetype/palette を**指名で**渡してプロンプト1文を生成
 * 3. SD3.5 に投げる。コンテンツフィルターで落ちた場合は archetype を1つ進めてフォールバック1文で再試行
 */
export async function generateArticleImage(
  input: GenerateArticleImageInput,
): Promise<GeneratedImage> {
  const maxRetries = input.maxRetries ?? IMAGE_ARCHETYPES.length
  const title = input.title.trim()
  const trimmedContent = input.content.trim()
  const seed = (input.rotationSeed ?? `${title}|${trimmedContent.slice(0, 80)}`).trim()

  const initialSlot = pickImageRotationSlot(seed)
  let currentSlot: ImageRotationSlot = initialSlot
  console.log(
    `[imageGen] rotation slot archetype=${initialSlot.archetypeId} palette=${initialSlot.paletteId}`,
  )

  let basePrompt: string
  try {
    basePrompt = await generateImagePromptFromArticle(title, trimmedContent, {
      archetypeId: initialSlot.archetypeId,
      paletteId: initialSlot.paletteId,
    })
  } catch (e) {
    console.warn('[imageGen] Gemini プロンプト失敗、フォールバック:', (e as Error)?.message)
    basePrompt = buildFallbackPromptFromSlot(initialSlot)
  }

  let lastFilterReason = ''
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const promptToUse =
      attempt === 0 ? basePrompt : buildFallbackPromptFromSlot(currentSlot)
    const prompt = appendScreenSafeSuffix(promptToUse)
    console.log(
      `[imageGen] attempt ${attempt + 1}/${maxRetries} archetype=${currentSlot.archetypeId} prompt=`,
      prompt.slice(0, 240),
    )
    const result = await invokeSD35(prompt, SAFE_NEGATIVE_PROMPT)
    if (result.base64) {
      return {
        buffer: Buffer.from(result.base64, 'base64'),
        mimeType: 'image/jpeg',
        prompt,
        rotation: currentSlot,
      }
    }
    lastFilterReason = result.filterReason ?? 'unknown'
    console.warn(`[imageGen] filtered (reason=${lastFilterReason})`)
    // 次のリトライでは archetype を1つ進める（palette は据え置き）
    currentSlot = {
      ...currentSlot,
      archetypeId: nextArchetypeIdAfter(currentSlot.archetypeId),
    }
  }

  throw new Error(
    `コンテンツフィルターにより画像生成に失敗しました（last reason=${lastFilterReason}）`,
  )
}
