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
      'portrait, headshot, close-up face, selfie',
      'revealing clothing, cleavage, exposed skin',
      'western faces, caucasian, blonde',
      'text, typography, watermark, logo',
      'cartoon, anime, illustration, painting',
      'low quality, blurry, distorted, deformed',
      'bright neon colors, colorful',
      'nsfw, inappropriate',
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
 */
export function buildPrompt(title: string, content: string): string {
  const text = title + content.slice(0, 200)

  const isTraining = /研修|トレーニング|セミナー|講座|ワークショップ/.test(text)
  const isELearning = /eラーニング|オンライン学習|LMS|動画研修|オンボーディング/.test(text)
  const isHR = /人事|採用|離職|定着|エンゲージメント|タレントマネジメント/.test(text)
  const isLeadership = /リーダー|管理職|マネジメント|1on1|フィードバック|OJT/.test(text)
  const isSkill = /スキル|育成|人材開発|キャリア|成長|組織開発/.test(text)

  let theme = ''

  if (isTraining) {
    theme =
      'bright modern training room with presenter pointing at screen showing abstract slides, audience seen from behind, professional daylight, no readable text on screen'
  } else if (isELearning) {
    theme =
      'person at modern desk with laptop showing abstract online learning UI with progress bar, headphones on desk, bright natural light, side angle, face not dominant, no readable text'
  } else if (isHR) {
    theme =
      'two HR professionals at bright white desk, open binder with training schedule and tablet showing abstract dashboard, hands reviewing documents in sharp focus, faces softly blurred, modern office'
  } else if (isLeadership) {
    const leaderThemes = [
      'wide shot of seminar room, participants with laptops and notebooks, abstract projection on whiteboard, no facial close-ups, professional corporate atmosphere',
      'upward staircase in bright corporate lobby with glass and greenery, aspirational growth metaphor, minimal abstract, no text, no people',
    ]
    theme = leaderThemes[Math.floor(Math.random() * leaderThemes.length)]!
  } else if (isSkill) {
    theme =
      'modern office atrium with ascending pathway, bright natural lighting, skill development and growth concept, no people visible, no readable text'
  } else {
    theme =
      'overhead flat-lay of HR training documents, notebook, pen and laptop with abstract e-learning screen on clean office desk, professional corporate style, no people, no readable text'
  }

  return [
    theme,
    'professional Japanese corporate photography',
    'photorealistic high quality',
    'sky blue white light grey color palette',
    'soft natural window lighting',
    'NO faces NO close-up portraits NO headshots',
    'NO text NO watermark NO logo',
    'NO revealing clothing NO casual wear',
    'horizontal 16:9 composition',
    'wide or overhead shot',
  ].join(', ')
}
