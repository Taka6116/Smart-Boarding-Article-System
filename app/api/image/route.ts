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
 * Smart Boarding サムネイル画像アーキタイプ
 * 実際のコラム記事サムネの特徴に合わせたライフスタイル系プロンプト
 * 5 パターン × 各 3-5 バリエーション = 高い多様性
 * ───────────────────────────────────────────────────────── */

/** パターンA: パステルグラデーション背景（テキスト余白あり） */
const ARCH_PASTEL_BG = [
  'soft pastel gradient background from pale pink to white, clean minimalist composition with large empty center space, subtle silhouettes of 3-4 business people in lower third, bright airy mood, lifestyle stock photography, 16:9',
  'gentle gradient background from mint green to cream white, abstract soft bokeh circles, minimalist corporate lifestyle aesthetic, large negative space in center, warm inviting mood, professional stock photo, 16:9',
  'sky blue to lavender soft gradient background, clean modern minimalist composition, faint abstract geometric shapes, bright and optimistic, professional lifestyle photography, 16:9',
  'warm peach to cream gradient background with soft light flares, minimalist clean layout, abstract pastel shapes, bright hopeful mood, no people, lifestyle stock aesthetic, 16:9',
] as const

/** パターンB: 人物シルエット・後ろ姿（感情・成長表現） */
const ARCH_SILHOUETTE = [
  'back view of person with arms raised wide toward bright sky at golden hour, silhouette against warm sunset, freedom and personal growth concept, shallow depth of field, warm orange and pink tones, lifestyle stock photography',
  'rear view of young professional walking confidently on open road toward horizon, early morning light with long shadows, aspirational journey concept, natural outdoor setting, photorealistic lifestyle shot',
  'side profile silhouette of person looking up at expansive bright sky, contemplative and hopeful mood, soft creamy bokeh background, golden hour natural light, warm color palette',
  'person jumping with joy photographed from behind, outdoor park or field setting, bright sunny daylight, blurred green background, energetic and positive, lifestyle stock photo',
  'back view of person standing on hilltop overlooking vast landscape, dawn light, sense of possibility and new beginnings, shallow depth of field, warm tones',
] as const

/** パターンC: ワークライフスタイル（顔見えず・デスク・カフェ） */
const ARCH_WORK_LIFESTYLE = [
  'overhead view of person working on laptop at warm wooden desk, notebook and coffee cup beside, only hands and forearms visible, soft natural window light, cozy productive workspace, lifestyle stock photography',
  'side angle of person writing in notebook at bright cafe table, laptop open, face turned away from camera, shallow depth of field with bokeh, natural daylight through window, casual business attire',
  'close-up of hands using tablet device on modern desk with small potted plant, soft focus background with greenery and window light, bright airy mood, professional lifestyle shot',
  'person reading documents at wooden desk near window, photographed from behind showing shoulders and desk, warm morning light, notebook and pen, cozy home-office aesthetic, lifestyle photography',
  'overhead flat-lay of notebook, pen, laptop, coffee cup and small succulent plant on clean white desk, warm natural lighting, minimalist productive workspace, no people, lifestyle stock photo',
] as const

/** パターンD: コンセプチュアル・抽象（道・時計・階段メタファー） */
const ARCH_CONCEPTUAL = [
  'empty straight road stretching to distant horizon under bright blue sky with scattered clouds, journey and decision concept, shallow focus on road surface, natural sunlit landscape, optimistic mood, lifestyle photography',
  'close-up of hand holding vintage pocket watch or small clock, extremely soft pastel bokeh background, time management concept, warm natural light, lifestyle photography aesthetic',
  'ascending bright wooden staircase in modern minimalist interior with large window and greenery, growth metaphor, natural daylight flooding in, clean airy composition, no people',
  'single compass on rustic wooden surface, soft bokeh background with warm golden light, direction and purpose concept, close-up macro, lifestyle stock photo aesthetic',
  'morning sunlight streaming through large window onto empty wooden desk with single coffee cup, new day fresh start concept, warm golden tones, minimalist clean composition',
] as const

/** パターンE: ポジティブ感情（笑顔・活力・カジュアル） */
const ARCH_POSITIVE = [
  'young person laughing freely wearing sunglasses, photographed from slightly below, bright blue sky background, peace sign gesture, casual stylish clothing, face partially visible, lifestyle stock photography, shallow depth of field',
  'two colleagues high-fiving or celebrating success, shot from side angle showing hands meeting, bright modern office or outdoor setting, warm bokeh background, genuine joy and energy, lifestyle photo',
  'group of young professionals walking together outdoors, photographed from behind, bright daylight and long shadows, casual business attire, team camaraderie, lifestyle stock photo',
  'person stretching arms overhead at desk near bright window, photographed from behind, morning light, relaxed productive energy, modern clean workspace, lifestyle photography',
  'close-up of two pairs of hands doing fist bump over bright desk surface, teamwork celebration, shallow depth of field, warm natural light, no faces visible, positive mood',
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
        'Faces turned away or back view or softly blurred, no direct camera-facing portraits',
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
      'direct camera-facing portrait, headshot, close-up face, selfie, beauty glamor model shot',
      'revealing clothing, cleavage, exposed skin',
      'western faces, caucasian, blonde',
      'formal dark suit, stiff corporate conference room, boardroom',
      'text, typography, watermark, logo, subtitle, caption',
      'readable text, legible numbers, gibberish letters, random letters, floating letters',
      'carved letters on wood, alphabet blocks, letter cubes, engraved symbols on cubes',
      'garbled UI text, meaningless digits on paper, newspaper headline',
      'cartoon, anime, illustration, painting, 3D render',
      'low quality, blurry, distorted, deformed, oversaturated',
      'dark moody atmosphere, dramatic shadows, noir lighting',
      'bright neon colors, harsh fluorescent lighting',
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

  const isIntrospection = /自分|過去|感情|認める|褒め|内省|振り返|モチベーション|自信|パラダイム/.test(text)
  const isAction = /行動|実践|やってみ|チャレンジ|挑戦|仕掛け|習慣/.test(text)
  const isTraining = /研修|トレーニング|セミナー|講座|ワークショップ|階層別/.test(text)
  const isELearning = /eラーニング|オンライン学習|LMS|動画研修|オンボーディング/.test(text)
  const isHR = /人事|採用|離職|定着|エンゲージメント|タレントマネジメント|新入社員/.test(text)
  const isLeadership = /リーダー|管理職|マネジメント|1on1|フィードバック|OJT/.test(text)
  const isTeam = /チーム|組織|コミュニケーション|協力|連携|一体感/.test(text)
  const isTime = /時間|計画|スケジュール|優先順位|効率|生産性/.test(text)
  const isCareer = /キャリア|成長|スキル|育成|人材開発|可能性|将来/.test(text)
  const isPositive = /褒められ|嬉しい|楽し|笑顔|感謝|誕生日|ポジティブ/.test(text)

  let theme = ''

  if (isIntrospection) {
    theme = pickRandom([...ARCH_SILHOUETTE, ...ARCH_CONCEPTUAL])
  } else if (isPositive) {
    theme = pickRandom([...ARCH_POSITIVE, ...ARCH_SILHOUETTE])
  } else if (isAction) {
    theme = pickRandom([...ARCH_POSITIVE, ...ARCH_SILHOUETTE, ...ARCH_WORK_LIFESTYLE])
  } else if (isTeam) {
    theme = pickRandom([...ARCH_POSITIVE, ...ARCH_WORK_LIFESTYLE])
  } else if (isTraining) {
    theme = pickRandom([...ARCH_WORK_LIFESTYLE, ...ARCH_PASTEL_BG, ...ARCH_SILHOUETTE])
  } else if (isELearning) {
    theme = pickRandom([...ARCH_WORK_LIFESTYLE, ...ARCH_PASTEL_BG])
  } else if (isHR) {
    theme = pickRandom([...ARCH_WORK_LIFESTYLE, ...ARCH_PASTEL_BG, ...ARCH_POSITIVE])
  } else if (isLeadership) {
    theme = pickRandom([...ARCH_SILHOUETTE, ...ARCH_CONCEPTUAL, ...ARCH_WORK_LIFESTYLE])
  } else if (isTime) {
    theme = pickRandom([...ARCH_CONCEPTUAL, ...ARCH_WORK_LIFESTYLE])
  } else if (isCareer) {
    theme = pickRandom([...ARCH_SILHOUETTE, ...ARCH_CONCEPTUAL, ...ARCH_POSITIVE])
  } else {
    theme = pickRandom([
      ...ARCH_SILHOUETTE,
      ...ARCH_WORK_LIFESTYLE,
      ...ARCH_CONCEPTUAL,
      ...ARCH_PASTEL_BG,
      ...ARCH_POSITIVE,
    ])
  }

  return [
    theme,
    'lifestyle stock photography aesthetic similar to Unsplash or Adobe Stock',
    'photorealistic high quality with professional composition',
    'soft natural window lighting or golden hour glow',
    'shallow depth of field with creamy bokeh',
    'bright airy optimistic mood with high key lighting',
    'pastel gradient tones or natural warm earth tones',
    'faces turned away or back view or side profile or softly blurred',
    'no readable text no watermark no logo',
    'horizontal 16:9 composition',
  ].join(', ')
}
