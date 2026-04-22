/**
 * AWS Bedrock 経由で Claude モデルを呼び出すフォールバック用クライアント。
 *
 * Gemini が枠切れ・障害等で失敗した際に generateContentWithFallback の Claude 側として使う。
 * モデル選定（2026 Q1 現在）：
 *   メイン : anthropic.claude-sonnet-4-6  （高品質・記事品質維持）
 *   予備   : anthropic.claude-haiku-4-5   （低コスト・最終保険）
 *
 * Sonnet 4.x / Haiku 4.x は多くの場合クロスリージョン推論プロファイル経由でしか呼べないため、
 * foundation-model 直接 InvokeModel が AccessDeniedException になった場合は
 * 自動的に inference-profile ID（例: us.anthropic.claude-sonnet-4-6）にフォールバックする。
 */
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime'

const DEFAULT_PRIMARY_MODEL = 'anthropic.claude-sonnet-4-6'
const DEFAULT_FALLBACK_MODEL = 'anthropic.claude-haiku-4-5'
const DEFAULT_REGION = 'us-west-2'
/** anthropic InvokeModel の bedrock version（Claude 3+ 系で共通） */
const ANTHROPIC_BEDROCK_VERSION = 'bedrock-2023-05-31'

export interface ClaudeInvocationOptions {
  /** 出力最大トークン（既定 8000） */
  maxTokens?: number
  /** temperature（既定 0.7） */
  temperature?: number
  /** system プロンプト（任意） */
  system?: string
}

function getClaudeBedrockClient(): BedrockRuntimeClient | null {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim()
  if (!accessKeyId || !secretAccessKey) return null
  return new BedrockRuntimeClient({
    region: process.env.CLAUDE_BEDROCK_REGION?.trim() || DEFAULT_REGION,
    credentials: { accessKeyId, secretAccessKey },
  })
}

/** 候補モデルID（メイン → 予備） */
function getClaudeModelCandidates(): string[] {
  const primary = process.env.CLAUDE_BEDROCK_MODEL?.trim() || DEFAULT_PRIMARY_MODEL
  const fallback =
    process.env.CLAUDE_BEDROCK_MODEL_FALLBACK?.trim() || DEFAULT_FALLBACK_MODEL
  const list = [primary]
  if (fallback && fallback !== primary) list.push(fallback)
  return list
}

/** foundation-model ID に対応する US クロスリージョン推論プロファイル ID を組み立てる */
function toUsInferenceProfileId(modelId: string): string {
  if (modelId.startsWith('us.') || modelId.startsWith('apac.') || modelId.startsWith('eu.')) {
    return modelId
  }
  return `us.${modelId}`
}

interface AnthropicContentBlock {
  type: string
  text?: string
}

interface AnthropicInvokeResponse {
  content?: AnthropicContentBlock[]
  stop_reason?: string
  usage?: { input_tokens?: number; output_tokens?: number }
}

async function invokeOnce(
  client: BedrockRuntimeClient,
  modelId: string,
  prompt: string,
  opts: ClaudeInvocationOptions,
): Promise<string> {
  const body = {
    anthropic_version: ANTHROPIC_BEDROCK_VERSION,
    max_tokens: opts.maxTokens ?? 8000,
    temperature: opts.temperature ?? 0.7,
    ...(opts.system ? { system: opts.system } : {}),
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: prompt }],
      },
    ],
  }

  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: new TextEncoder().encode(JSON.stringify(body)),
  })

  const response = await client.send(command)
  const parsed = JSON.parse(
    new TextDecoder().decode(response.body),
  ) as AnthropicInvokeResponse

  const texts = (parsed.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text ?? '')
  const joined = texts.join('').trim()
  if (!joined) {
    throw new Error(
      `Claude レスポンスにテキストが含まれていません (stop_reason=${parsed.stop_reason ?? 'unknown'})`,
    )
  }
  return joined
}

function isAccessDeniedOrNotFound(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { name?: string; message?: string }
  if (e.name === 'AccessDeniedException' || e.name === 'ResourceNotFoundException') {
    return true
  }
  const msg = e.message ?? ''
  return /AccessDenied|ResourceNotFound|on-demand throughput isn.?t supported|inference profile/i.test(
    msg,
  )
}

/** Claude が有効化されていて呼び出し可能かどうかを判定する（環境変数の有無だけで判定、実呼び出しはしない） */
export function isClaudeConfigured(): boolean {
  if ((process.env.CLAUDE_ENABLE_FALLBACK ?? 'true').trim().toLowerCase() === 'false') {
    return false
  }
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim()
  return Boolean(accessKeyId && secretAccessKey)
}

/**
 * Claude（Bedrock）で1回の Completion を生成する。
 * 候補モデルを順に試し、foundation-model の直接呼び出しで権限が落ちたら
 * 自動的に `us.xxx` の inference profile ID に切り替えて再試行する。
 */
export async function generateWithClaude(
  prompt: string,
  opts: ClaudeInvocationOptions = {},
): Promise<string> {
  if (!isClaudeConfigured()) {
    throw new Error(
      'Claude フォールバックが無効、または AWS 認証情報が設定されていません。',
    )
  }
  const client = getClaudeBedrockClient()
  if (!client) {
    throw new Error('Bedrock クライアントの初期化に失敗しました')
  }

  const candidates = getClaudeModelCandidates()
  let lastError: unknown = null

  for (const baseModel of candidates) {
    const tryIds = [baseModel]
    const asProfile = toUsInferenceProfileId(baseModel)
    if (asProfile !== baseModel) tryIds.push(asProfile)

    for (const modelId of tryIds) {
      try {
        console.log(`[Claude] InvokeModel try modelId=${modelId}`)
        const text = await invokeOnce(client, modelId, prompt, opts)
        console.log(`[Claude] success modelId=${modelId} (${text.length} chars)`)
        return text
      } catch (e) {
        lastError = e
        const err = e as { name?: string; message?: string }
        console.warn(
          `[Claude] failed modelId=${modelId} name=${err?.name ?? ''} msg=${(err?.message ?? '').slice(0, 240)}`,
        )
        if (isAccessDeniedOrNotFound(e)) {
          continue
        }
        break
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Claude 呼び出しに失敗しました: ${String(lastError)}`)
}
