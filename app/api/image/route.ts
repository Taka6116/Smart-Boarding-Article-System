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

/** buildPrompt 用: 文字・ロゴを要求しないビジネス系アーキタイプ（無地キューブのみ／人物シーンは顔を主にしない） */
const ARCH_FLATLAY = [
  'overhead flat-lay of business documents and laptop with abstract colorful charts only no legible text, pen and coffee cup on clean white desk, professional stock photography, no people',
  'overhead flat-lay of financial printouts and abstract graphs, calculator and pen on white conference table, no readable numbers, no people, corporate photography',
  'overhead view of clean white desk with documents, laptop showing abstract dashboard graphics, professional M&A advisory workspace, no people',
  'overhead flat-lay of merger agreement stack, corporate stamp, pen and glasses on white desk, no people, professional stock photo',
  'overhead flat-lay on white desk: business papers, two plain solid wooden cubes with no letters or engraving, laptop with abstract charts, pen, no people',
] as const

const ARCH_PEOPLE_DESK = [
  'two business professionals in suits at bright white desk, open binder with colorful charts and tablet, hands reviewing documents in sharp focus, faces softly blurred or cropped, modern office, no camera-facing portrait',
  'side view of business colleagues at desk with documents and tablet, emphasis on charts and materials, shallow depth of field, faces not dominant, bright professional office',
  'modern office collaboration on light wooden desk, hands gesturing over laptop with abstract UI blocks, notebook and smartphone, strong bokeh, casual business shirt, second person blurred in background',
] as const

const ARCH_SKYLINE = [
  'dramatic low-angle worm-eye view of modern glass skyscrapers converging toward pale sky, cool blue-grey steel and glass facades, some warm lit windows, financial district, no people visible',
] as const

const ARCH_MEETING_WIDE = [
  'wide shot of modern conference table, business team seen from behind with laptops and document binders, strategy meeting atmosphere, silhouettes, no facial close-ups',
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
        'Professional corporate stock photography',
        'High quality photorealistic',
        'No readable text numbers logos or watermarks anywhere',
        'Abstract charts and screens only without legible labels',
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
      'portrait, headshot, close-up face, selfie, beauty glamor model shot',
      'revealing clothing, cleavage, exposed skin',
      'western faces, caucasian, blonde',
      'text, typography, watermark, logo, subtitle, caption',
      'readable text, legible numbers, gibberish letters, random letters, floating letters',
      'carved letters on wood, alphabet blocks, letter cubes, engraved symbols on cubes',
      'garbled UI text, meaningless digits on paper, newspaper headline',
      'cartoon, anime, illustration, painting',
      'low quality, blurry, distorted, deformed',
      'bright neon colors, colorful',
      'nsfw, inappropriate',
      'extra fingers, missing fingers, fused fingers, deformed hands, mutated hands',
      'six fingers, too many fingers, bad hands, malformed hands, extra limbs',
      'extra digits, fewer digits, cropped hands, poorly drawn hands',
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
  const text = title + (targetKeyword ?? '')

  const isContract = /契約|NDA|秘密保持|意向表明/.test(text)
  const isFinance = /補助金|税制|融資|資金|節税|バリュエーション|企業価値/.test(text)
  const isPMI = /PMI|統合|経営統合/.test(text)
  const isSuccession = /後継者|引継|承継/.test(text)
  const isMA = /M&A|買収|合併|仲介|売却/.test(text)

  let theme = ''

  if (isContract) {
    const pool = [
      ...ARCH_FLATLAY,
      'overhead flat-lay of stacked business contract documents and fountain pen on white desk, abstract seals only no readable clauses, no people',
    ]
    theme = pickRandom(pool)
  } else if (isFinance) {
    const pool = [
      ...ARCH_FLATLAY,
      'overhead flat-lay of financial charts and business reports on clean white conference table, calculator and pen, abstract graphs only no legible figures, no people',
    ]
    theme = pickRandom(pool)
  } else if (isPMI) {
    theme = pickRandom([...ARCH_MEETING_WIDE, ...ARCH_PEOPLE_DESK, ...ARCH_FLATLAY])
  } else if (isSuccession) {
    const pool = [
      'overhead flat-lay of business succession documents, company seal, pen and leather notebook on clean wooden desk, warm office lighting, no readable text, no people',
      ...ARCH_FLATLAY,
    ]
    theme = pickRandom(pool)
  } else if (isMA) {
    const pool = [
      ...ARCH_FLATLAY,
      ...ARCH_PEOPLE_DESK,
      ...ARCH_SKYLINE,
      ...ARCH_MEETING_WIDE,
    ]
    theme = pickRandom(pool)
  } else {
    theme = pickRandom([
      ...ARCH_FLATLAY,
      ...ARCH_SKYLINE,
      'overhead flat-lay of Japanese business documents, notebook, pen and laptop with abstract screen, clean office desk, no people',
    ])
  }

  return [
    theme,
    'professional Japanese corporate photography',
    'photorealistic high quality',
    'navy blue white grey color palette',
    'soft natural window lighting',
    'corporate editorial stock style, no selfie, avoid extreme glamor portrait close-ups',
    'no readable text no watermark no logo, abstract charts only',
    'horizontal 16:9 composition',
  ].join(', ')
}
