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

/** buildPrompt 用: 人材育成・eラーニング・研修をイメージするアーキタイプ */
const ARCH_FLATLAY = [
  'overhead flat-lay of training materials and laptop with abstract LMS dashboard on screen, pen and notebook on clean white desk, professional stock photography, no people, no readable text',
  'overhead flat-lay of HR analytics printouts with abstract bar charts, pen and tablet on white conference table, no readable numbers, no people, corporate photography',
  'overhead view of clean white desk with training outline documents, laptop showing abstract course-progress UI, professional e-learning workspace, no people',
  'overhead flat-lay of employee development plan documents, colorful sticky notes and pen on white desk, no people, no readable text, professional stock photo',
  'overhead flat-lay on white desk: skill assessment papers, laptop with abstract learning dashboard, notebook and coffee cup, no people, no readable text',
] as const

const ARCH_PEOPLE_DESK = [
  'two HR professionals at bright white desk, open binder with training schedule and tablet showing abstract dashboard, hands reviewing documents in sharp focus, faces softly blurred, modern office, no camera-facing portrait',
  'side view of mentor coaching colleague at desk with documents and tablet, emphasis on materials, shallow depth of field, faces not dominant, bright professional office',
  'modern office collaboration on light wooden desk, hands gesturing over laptop with abstract e-learning UI, notebook and smartphone, strong bokeh, casual business attire, second person blurred in background',
] as const

const ARCH_TRAINING_ROOM = [
  'bright modern training room with presenter pointing at screen showing abstract slides, audience seen from behind, professional daylight, no readable text on screen',
  'wide shot of seminar room, participants with laptops and notebooks, abstract projection on whiteboard, no facial close-ups, professional corporate atmosphere',
] as const

const ARCH_GROWTH = [
  'upward staircase in bright corporate lobby with glass and greenery, aspirational growth metaphor, minimal abstract, no text, no people',
  'modern office atrium with ascending pathway or stairway, bright natural lighting, skill development concept, no people visible',
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

  const isTraining = /研修|トレーニング|セミナー|講座|ワークショップ/.test(text)
  const isELearning = /eラーニング|オンライン学習|LMS|動画研修|オンボーディング/.test(text)
  const isHR = /人事|採用|離職|定着|エンゲージメント|タレントマネジメント/.test(text)
  const isLeadership = /リーダー|管理職|マネジメント|1on1|フィードバック|OJT/.test(text)
  const isSkill = /スキル|育成|人材開発|キャリア|成長|組織開発/.test(text)

  let theme = ''

  if (isTraining) {
    theme = pickRandom([...ARCH_TRAINING_ROOM, ...ARCH_PEOPLE_DESK, ...ARCH_FLATLAY])
  } else if (isELearning) {
    const pool = [
      ...ARCH_FLATLAY,
      'person at modern desk with laptop showing abstract online learning UI with progress bar, headphones on desk, bright natural light, side angle, face not dominant, no readable text',
    ]
    theme = pickRandom(pool)
  } else if (isHR) {
    theme = pickRandom([...ARCH_PEOPLE_DESK, ...ARCH_FLATLAY, ...ARCH_TRAINING_ROOM])
  } else if (isLeadership) {
    theme = pickRandom([...ARCH_TRAINING_ROOM, ...ARCH_PEOPLE_DESK, ...ARCH_GROWTH])
  } else if (isSkill) {
    theme = pickRandom([...ARCH_GROWTH, ...ARCH_FLATLAY, ...ARCH_PEOPLE_DESK])
  } else {
    theme = pickRandom([
      ...ARCH_FLATLAY,
      ...ARCH_GROWTH,
      ...ARCH_TRAINING_ROOM,
      'overhead flat-lay of Japanese HR training documents, notebook, pen and laptop with abstract screen, clean office desk, no people, no readable text',
    ])
  }

  return [
    theme,
    'professional Japanese corporate photography',
    'photorealistic high quality',
    'sky blue white light grey color palette',
    'soft natural window lighting',
    'corporate editorial stock style for HR and training, no selfie, avoid extreme glamor portrait close-ups',
    'no readable text no watermark no logo, abstract charts only',
    'horizontal 16:9 composition',
  ].join(', ')
}
