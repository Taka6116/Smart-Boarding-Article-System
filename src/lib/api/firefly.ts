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
      'direct camera-facing portrait, headshot, close-up face, selfie, beauty glamor model shot',
      'revealing clothing, cleavage, exposed skin',
      'western faces, caucasian, blonde',
      'formal dark suit, stiff corporate conference room, boardroom',
      'text, typography, watermark, logo, subtitle, caption',
      'readable text, legible numbers, gibberish letters, random letters, floating letters',
      'cartoon, anime, illustration, painting, 3D render',
      'low quality, blurry, distorted, deformed, oversaturated',
      'dark moody atmosphere, dramatic shadows, noir lighting',
      'bright neon colors, harsh fluorescent lighting',
      'nsfw, inappropriate',
      'extra fingers, missing fingers, fused fingers, deformed hands, mutated hands',
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
 * Smart Boarding コラム記事のサムネイル品質・トンマナに準拠
 */
export function buildPrompt(title: string, content: string): string {
  const text = title + content.slice(0, 200)

  const PASTEL_BG = [
    'soft pastel gradient background from pale pink to white, clean minimalist composition with large empty center space, subtle silhouettes of 3-4 business people in lower third, bright airy mood, lifestyle stock photography, 16:9',
    'gentle gradient background from mint green to cream white, abstract soft bokeh circles, minimalist corporate lifestyle aesthetic, warm inviting mood, professional stock photo, 16:9',
    'sky blue to lavender soft gradient background, clean modern minimalist composition, bright and optimistic, professional lifestyle photography, 16:9',
    'warm peach to cream gradient background with soft light flares, minimalist clean layout, bright hopeful mood, lifestyle stock aesthetic, 16:9',
  ]
  const SILHOUETTE = [
    'back view of person with arms raised wide toward bright sky at golden hour, silhouette against warm sunset, freedom and personal growth concept, warm orange and pink tones, lifestyle stock photography',
    'rear view of young professional walking confidently on open road toward horizon, early morning light, aspirational journey concept, photorealistic lifestyle shot',
    'side profile silhouette of person looking up at expansive bright sky, contemplative and hopeful mood, soft creamy bokeh background, golden hour natural light',
    'person jumping with joy photographed from behind, outdoor park setting, bright sunny daylight, blurred green background, lifestyle stock photo',
    'back view of person standing on hilltop overlooking vast landscape, dawn light, sense of possibility, warm tones',
  ]
  const WORK_LIFE = [
    'overhead view of person working on laptop at warm wooden desk, notebook and coffee cup beside, only hands visible, soft natural window light, cozy workspace, lifestyle stock photography',
    'side angle of person writing in notebook at bright cafe table, laptop open, face turned away, shallow depth of field with bokeh, casual business attire',
    'close-up of hands using tablet device on modern desk with small potted plant, soft focus background with greenery, bright airy mood, lifestyle shot',
    'person reading documents at wooden desk near window, photographed from behind, warm morning light, cozy home-office aesthetic',
    'overhead flat-lay of notebook, pen, laptop, coffee cup and succulent on clean white desk, warm natural lighting, minimalist workspace, no people',
  ]
  const CONCEPTUAL = [
    'empty straight road stretching to distant horizon under bright blue sky, journey and decision concept, shallow focus on road, optimistic mood, lifestyle photography',
    'close-up of hand holding vintage pocket watch, extremely soft pastel bokeh background, time management concept, warm natural light',
    'ascending bright wooden staircase in modern minimalist interior with large window and greenery, growth metaphor, natural daylight, no people',
    'single compass on rustic wooden surface, soft bokeh background with warm golden light, direction and purpose concept, lifestyle stock photo',
    'morning sunlight streaming through large window onto empty wooden desk with single coffee cup, new day concept, warm golden tones, minimalist',
  ]
  const POSITIVE = [
    'young person laughing freely wearing sunglasses, photographed from slightly below, bright blue sky background, casual stylish clothing, face partially visible, lifestyle stock photography, shallow depth of field',
    'two colleagues high-fiving, shot from side angle showing hands meeting, bright modern setting, warm bokeh background, genuine joy, lifestyle photo',
    'group of young professionals walking together outdoors, photographed from behind, bright daylight, casual business attire, team camaraderie',
    'person stretching arms overhead at desk near bright window, photographed from behind, morning light, relaxed productive energy, lifestyle photography',
    'close-up of two pairs of hands doing fist bump over bright desk, teamwork celebration, shallow depth of field, warm natural light, no faces visible',
  ]

  function pick<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)]!
  }

  const isIntrospection = /自分|過去|感情|認める|褒め|内省|振り返|モチベーション|自信|パラダイム/.test(text)
  const isAction = /行動|実践|やってみ|チャレンジ|挑戦|仕掛け|習慣/.test(text)
  const isTraining = /研修|トレーニング|セミナー|講座|ワークショップ|階層別/.test(text)
  const isELearning = /eラーニング|オンライン学習|LMS|動画研修|オンボーディング/.test(text)
  const isHR = /人事|採用|離職|定着|エンゲージメント|新入社員/.test(text)
  const isLeadership = /リーダー|管理職|マネジメント|1on1|フィードバック|OJT/.test(text)
  const isTeam = /チーム|組織|コミュニケーション|協力|連携|一体感/.test(text)
  const isTime = /時間|計画|スケジュール|優先順位|効率|生産性/.test(text)
  const isCareer = /キャリア|成長|スキル|育成|人材開発|可能性|将来/.test(text)
  const isPositive = /褒められ|嬉しい|楽し|笑顔|感謝|誕生日|ポジティブ/.test(text)

  let theme = ''

  if (isIntrospection) {
    theme = pick([...SILHOUETTE, ...CONCEPTUAL])
  } else if (isPositive) {
    theme = pick([...POSITIVE, ...SILHOUETTE])
  } else if (isAction) {
    theme = pick([...POSITIVE, ...SILHOUETTE, ...WORK_LIFE])
  } else if (isTeam) {
    theme = pick([...POSITIVE, ...WORK_LIFE])
  } else if (isTraining) {
    theme = pick([...WORK_LIFE, ...PASTEL_BG, ...SILHOUETTE])
  } else if (isELearning) {
    theme = pick([...WORK_LIFE, ...PASTEL_BG])
  } else if (isHR) {
    theme = pick([...WORK_LIFE, ...PASTEL_BG, ...POSITIVE])
  } else if (isLeadership) {
    theme = pick([...SILHOUETTE, ...CONCEPTUAL, ...WORK_LIFE])
  } else if (isTime) {
    theme = pick([...CONCEPTUAL, ...WORK_LIFE])
  } else if (isCareer) {
    theme = pick([...SILHOUETTE, ...CONCEPTUAL, ...POSITIVE])
  } else {
    theme = pick([...SILHOUETTE, ...WORK_LIFE, ...CONCEPTUAL, ...PASTEL_BG, ...POSITIVE])
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
