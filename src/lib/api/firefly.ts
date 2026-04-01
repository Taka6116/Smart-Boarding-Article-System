import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime'

/** Stable Diffusion 3.5 は us-west-2 でのみ利用可能 */
const BEDROCK_IMAGE_REGION = 'us-west-2'

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
 * AWS Bedrock Stable Diffusion 3.5 Large で画像を生成する
 * 戻り値：data:image/jpeg;base64,... 形式のURL（容量削減のため JPEG 出力）
 */
export async function generateImageWithFirefly(
  title: string,
  content: string
): Promise<string> {
  if (!process.env.AWS_ACCESS_KEY_ID?.trim() || !process.env.AWS_SECRET_ACCESS_KEY?.trim()) {
    throw new Error(
      'AWS認証情報（AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY）が設定されていません。'
    )
  }
  const prompt = buildPrompt(title, content)

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
      'readable text, legible numbers, gibberish letters, random letters',
      'cartoon, anime, illustration, painting, 3D render',
      'low quality, blurry, distorted, deformed, oversaturated',
      'dark moody atmosphere, dramatic shadows, noir lighting',
      'bright neon colors, harsh fluorescent lighting',
      'nsfw, adult content',
    ].join(', '),
    mode: 'text-to-image',
    aspect_ratio: '16:9',
    output_format: 'jpeg',
  }

  const bodyBytes = new TextEncoder().encode(JSON.stringify(requestBody))
  const command = new InvokeModelCommand({
    modelId: 'stability.sd3-5-large-v1:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: bodyBytes,
  })

  try {
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

    return `data:image/jpeg;base64,${base64Image}`
  } catch (error) {
    console.error('Bedrock Stable Diffusion error:', error)
    let message = 'Stable Diffusion による画像生成に失敗しました'
    if (error instanceof Error) {
      message =
        error.name === 'AccessDeniedException'
          ? 'Bedrock の利用権限がありません。IAM に bedrock:InvokeModel を追加してください。'
          : error.name === 'ResourceNotFoundException'
            ? '指定したモデルが見つかりません。BEDROCK_REGION=us-west-2 を確認してください。'
            : error.message
    }
    throw new Error(message)
  }
}

/**
 * 記事タイトル・本文から英語の画像プロンプトを生成する
 * SD 3.5は英語プロンプトの方が品質が高い
 * コンテンツフィルター回避のため人物要素完全除外
 */
export function buildPrompt(title: string, content: string): string {
  const PASTEL_BG = [
    'soft pastel gradient background from pale pink to white, clean minimalist composition, abstract geometric shapes, bright airy mood, lifestyle stock photography, 16:9',
    'gentle gradient from mint green to cream white, abstract soft bokeh circles, minimalist corporate aesthetic, warm inviting, professional stock photo, 16:9',
    'sky blue to lavender gradient, clean modern minimalist, bright optimistic, professional lifestyle photography, 16:9',
    'warm peach to cream gradient with soft light flares, minimalist clean, bright hopeful, lifestyle aesthetic, 16:9',
  ]
  const WORKSPACE = [
    'overhead view of clean wooden desk with laptop, notebook and coffee cup, soft natural window light, minimalist workspace, no people, lifestyle photography',
    'bright cafe table with open laptop and documents, morning light through window, cozy atmosphere, empty chair, no people, 16:9',
    'modern desk with tablet device and small potted plant, soft focus background with greenery, bright airy mood, no people, lifestyle shot',
    'neat workspace near window with laptop, pen and calendar on wooden surface, warm natural lighting, no people, 16:9',
    'overhead flat-lay of notebook, pen, laptop, coffee cup and succulent on white desk, warm lighting, minimalist, no people, lifestyle photo',
  ]
  const ABSTRACT = [
    'empty straight road stretching to distant horizon under bright blue sky, journey concept, shallow focus, optimistic mood, no people, lifestyle photography',
    'vintage pocket watch on wooden surface, extremely soft bokeh background, time management concept, warm natural light, no people, close-up',
    'ascending wooden staircase in bright minimalist interior with large window and greenery, growth metaphor, natural daylight, no people',
    'compass on wooden surface with soft golden bokeh, direction and purpose concept, no people, lifestyle aesthetic',
    'morning sunlight streaming through window onto empty desk with coffee cup, new day concept, warm tones, minimalist, no people',
    'open book with pen on wooden table, window light, learning concept, soft focus, warm atmosphere, no people, 16:9',
  ]
  const NATURE = [
    'bright open field with blue sky and soft clouds, fresh green grass, freedom and possibility concept, natural daylight, no people, landscape',
    'sunny park pathway with trees and dappled sunlight, inviting forward journey, bright mood, shallow depth of field, no people',
    'modern glass building exterior reflecting blue sky, upward angle, aspirational architecture, bright daylight, no people',
    'peaceful lake horizon under bright sky, calm water surface, tranquility concept, natural light, no people, minimalist landscape',
  ]

  function pick<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)]!
  }

  const safePool = [...PASTEL_BG, ...WORKSPACE, ...ABSTRACT, ...NATURE]
  const theme = pick(safePool)

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
