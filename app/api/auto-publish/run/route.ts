/**
 * 自動投稿オーケストレーター。
 * GitHub Actions の cron ワークフロー（火・金 JST 10:00）から Bearer CRON_SECRET 付きで叩かれる。
 *
 * 1 リクエスト = 1 記事。処理：
 *   1. Authorization: Bearer ${CRON_SECRET} を検証
 *   2. autorun/queue.json の先頭 1 件を peek
 *   3. 対応する prompts/<id>.json を読み込み
 *   4. generateFirstDraftFromPrompt（Gemini → Claude フォールバック）
 *   5. refineArticleWithGemini
 *   6. generateSlugFromGemini
 *   7. generateArticleImage（SD3.5）
 *   8. compositeArticleTitleOnImageServer（@napi-rs/canvas でタイトル焼き込み）
 *   9. WordPress メディアにアップロード
 *  10. postToWordPress(status='future', scheduledDate = now + 2h)
 *  11. SavedArticle を articles/<id>.json に保存
 *  12. キューから shift、history へ success を記録
 *
 * 失敗時：history に failed を記録し、先頭に failureCount++ で戻す（3 回連続失敗で drop）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { getS3ObjectAsText, putS3Object } from '@/lib/s3Reference'
import {
  peekAutoRunItem,
  shiftAutoRunItem,
  requeueHeadAfterFailure,
  appendAutoRunHistory,
  type AutoRunQueueItem,
} from '@/lib/autoRunQueue'
import {
  generateFirstDraftFromPrompt,
  refineArticleWithGemini,
  generateSlugFromGemini,
} from '@/lib/api/gemini'
import { generateArticleImage } from '@/lib/imageGeneration'
import { compositeArticleTitleOnImageServer } from '@/lib/compositeArticleTitleOnImageServer'
import { postToWordPress } from '@/lib/wordpress'
import type { SavedArticle } from '@/lib/types'

/** Node runtime 必須（@napi-rs/canvas と aws-sdk がバンドル対象） */
export const runtime = 'nodejs'
/** 最大実行時間（Vercel Hobby は 300 秒が上限。画像 & 推敲 & WP 投稿込みで 120〜180 秒程度） */
export const maxDuration = 300
export const dynamic = 'force-dynamic'

interface SavedPromptS3 {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

function getScheduledDelayHours(): number {
  const raw = process.env.AUTO_PUBLISH_SCHEDULE_DELAY_HOURS?.trim()
  if (raw) {
    const n = parseFloat(raw)
    if (Number.isFinite(n) && n >= 0 && n <= 24) return n
  }
  return 2
}

function computeScheduledDate(): string {
  const delayMs = getScheduledDelayHours() * 60 * 60 * 1000
  return new Date(Date.now() + delayMs).toISOString()
}

function isCronAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim()
  if (!expected) {
    console.error('[auto-publish] CRON_SECRET が未設定のため呼び出しを拒否します')
    return false
  }
  const header = request.headers.get('authorization') ?? ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (bearer && bearer === expected) return true
  // Vercel Cron 系の互換：?secret=xxx も許容（今回は未使用だが保険）
  const url = new URL(request.url)
  const q = url.searchParams.get('secret')?.trim()
  return q === expected
}

function estimateWordCount(content: string): number {
  if (!content) return 0
  return content.replace(/\s+/g, '').length
}

async function loadPromptById(promptId: string): Promise<SavedPromptS3 | null> {
  const key = `prompts/${promptId}.json`
  const result = await getS3ObjectAsText(key)
  if (!result) return null
  try {
    return JSON.parse(result.content) as SavedPromptS3
  } catch {
    return null
  }
}

async function uploadImageToWordPressMedia(
  buffer: Buffer,
  mimeType: string,
  fileNameBase: string,
): Promise<{ mediaId: number; sourceUrl: string }> {
  const wpUrl = process.env.WORDPRESS_URL?.trim()
  const username = process.env.WORDPRESS_USERNAME?.trim()
  const appPassword = process.env.WORDPRESS_APP_PASSWORD?.trim()
  if (!wpUrl || !username || !appPassword) {
    throw new Error('WORDPRESS_URL / WORDPRESS_USERNAME / WORDPRESS_APP_PASSWORD が未設定です')
  }
  const credentials = Buffer.from(`${username}:${appPassword}`).toString('base64')
  const ext = mimeType.split('/')[1] ?? 'jpg'
  const safeBase = fileNameBase.replace(/[^\w-]/g, '-').slice(0, 60) || 'sb-auto'
  const fileName = `${safeBase}-${Date.now()}.${ext}`

  const base = wpUrl.replace(/\/+$/, '')
  const mediaUrl = `${base}/?rest_route=${encodeURIComponent('/wp/v2/media')}`

  const res = await fetch(mediaUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Type': mimeType,
    },
    body: new Uint8Array(buffer),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(
      `WordPress メディアアップロード失敗 (${res.status}): ${(data as { message?: string }).message ?? res.statusText}`,
    )
  }
  const media = (await res.json()) as { id: number; source_url?: string; link?: string }
  const sourceUrl = (media.source_url ?? media.link ?? '').replace(/^http:\/\//, 'https://')
  return { mediaId: media.id, sourceUrl }
}

async function processSingleItem(item: AutoRunQueueItem): Promise<{
  articleId: string
  wordpressPostId: number
  wordpressUrl: string
  scheduledFor: string
}> {
  console.log('[auto-publish] start item', {
    id: item.id,
    promptId: item.promptId,
    keyword: item.keyword,
  })

  const promptRow = await loadPromptById(item.promptId)
  if (!promptRow || !promptRow.content?.trim()) {
    throw new Error(`プロンプト ${item.promptId} が S3 に存在しないか空です`)
  }

  // 1. 一次執筆（Gemini → 失敗時 Claude フォールバックは gemini.ts 側で処理）
  const draft = await generateFirstDraftFromPrompt(
    promptRow.content,
    item.keyword,
    undefined, // 自動投稿では現状 S3 資料の自動参照は行わない（プロンプト本文で完結）
  )

  // 2. 推敲
  const refined = await refineArticleWithGemini(draft.title, draft.content, item.keyword)

  // 3. スラッグ
  const slug = await generateSlugFromGemini(
    refined.refinedTitle,
    item.keyword,
    refined.refinedContent,
  )

  // 4. 画像生成
  const image = await generateArticleImage({
    title: refined.refinedTitle,
    content: refined.refinedContent,
  })

  // 5. タイトル焼き込み
  const composited = await compositeArticleTitleOnImageServer(image.buffer, refined.refinedTitle)

  // 6. WordPress メディアアップロード
  const media = await uploadImageToWordPressMedia(
    composited.buffer,
    composited.mimeType,
    item.keyword.slice(0, 40),
  )

  // 7. WordPress へ予約投稿
  const scheduledFor = computeScheduledDate()
  const wpStatus: 'future' = 'future'
  const postResult = await postToWordPress(
    {
      title: refined.refinedTitle,
      content: refined.refinedContent,
      targetKeyword: item.keyword,
      slug,
      ...(item.wordpressTags ? { wordpressTags: item.wordpressTags } : {}),
    },
    wpStatus,
    {
      scheduledDate: scheduledFor,
      preUploadedMediaId: media.mediaId,
      preUploadedImageUrl: media.sourceUrl,
      ...(item.wordpressCategoryIds ? { categoryIds: item.wordpressCategoryIds } : {}),
    },
  )

  // 8. SavedArticle を S3 に保存
  const articleId = `auto-${Date.now()}`
  const nowIso = new Date().toISOString()
  const saved: SavedArticle = {
    id: articleId,
    title: refined.refinedTitle,
    refinedTitle: refined.refinedTitle,
    targetKeyword: item.keyword,
    originalContent: draft.content,
    refinedContent: refined.refinedContent,
    imageUrl: media.sourceUrl,
    wordpressUrl: postResult.link,
    status: 'published',
    createdAt: nowIso,
    ...(postResult.dateGmt ? { wordpressPublishedAt: postResult.dateGmt } : {}),
    slug,
    wordpressPostStatus: postResult.status,
    wordCount: estimateWordCount(refined.refinedContent),
    ...(item.wordpressTags ? { wordpressTags: item.wordpressTags } : {}),
    ...(item.wordpressCategoryIds ? { wordpressCategoryIds: item.wordpressCategoryIds } : {}),
  }
  await putS3Object(`articles/${articleId}.json`, JSON.stringify(saved), 'application/json')

  console.log('[auto-publish] posted', {
    articleId,
    wordpressPostId: postResult.id,
    wordpressUrl: postResult.link,
    scheduledFor,
  })

  return {
    articleId,
    wordpressPostId: postResult.id,
    wordpressUrl: postResult.link,
    scheduledFor,
  }
}

async function runAutoPublish(): Promise<NextResponse> {
  const head = await peekAutoRunItem()
  if (!head) {
    console.log('[auto-publish] queue is empty, skipping')
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'queue-empty',
    })
  }

  const startedAt = new Date().toISOString()
  try {
    const result = await processSingleItem(head)
    // 成功したのでキューから正式に除去
    await shiftAutoRunItem()
    const finishedAt = new Date().toISOString()
    await appendAutoRunHistory({
      itemId: head.id,
      promptId: head.promptId,
      keyword: head.keyword,
      startedAt,
      finishedAt,
      status: 'success',
      articleId: result.articleId,
      wordpressPostId: result.wordpressPostId,
      wordpressUrl: result.wordpressUrl,
      scheduledFor: result.scheduledFor,
    })
    return NextResponse.json({
      ok: true,
      skipped: false,
      item: { id: head.id, promptId: head.promptId, keyword: head.keyword },
      result,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[auto-publish] failed:', message)
    const finishedAt = new Date().toISOString()
    await appendAutoRunHistory({
      itemId: head.id,
      promptId: head.promptId,
      keyword: head.keyword,
      startedAt,
      finishedAt,
      status: 'failed',
      error: message,
    })
    const { requeued, failureCount } = await requeueHeadAfterFailure(head, message)
    return NextResponse.json(
      {
        ok: false,
        item: { id: head.id, promptId: head.promptId, keyword: head.keyword },
        error: message,
        requeued,
        failureCount,
      },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return runAutoPublish()
}

/** GET も許容（GitHub Actions 側の curl が GET でも動作するように保険） */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return runAutoPublish()
}
