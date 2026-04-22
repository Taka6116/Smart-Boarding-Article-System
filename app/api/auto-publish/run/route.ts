/**
 * 自動投稿オーケストレーター v2（KW テーブル駆動）。
 * GitHub Actions の cron ワークフロー（火・金 JST 10:00）から Bearer CRON_SECRET 付きで叩かれる。
 *
 * 【v2 の方針】
 * - キューは廃止。代わりに「Ahrefs KW 分析テーブル（最新 type=keywords データセット）」を
 *   優先度降順・スコア降順で並び替え、先頭から "未投稿" の KW を 1 件選ぶ。
 * - "未投稿" の判定は buildKeywordWpEntriesByKeyword（SavedArticle.targetKeyword との正規化突合）で、
 *   /ahrefs 画面の投稿日列とまったく同じロジックを使う。
 * - 3 回連続失敗した KW は autorun/skipped.json に昇格し、以後自動選択対象外。
 *
 * 【1 リクエスト = 1 記事】
 *   1. Authorization: Bearer ${CRON_SECRET} を検証
 *   2. pickNextKeyword() で最新データセットから未投稿 KW の先頭を選ぶ
 *   3. generateAutoPrompt(kw) で記事生成プロンプトを合成
 *      （/ahrefs の「記事作成」ボタン押下時と完全に同一の関数・同一の文言）
 *   4. generateFirstDraftFromPrompt（Gemini → Claude フォールバック）
 *   5. refineArticleWithGemini
 *   6. generateSlugFromGemini
 *   7. generateArticleImage（SD3.5）
 *   8. compositeArticleTitleOnImageServer（@napi-rs/canvas でタイトル焼き込み）
 *   9. WordPress メディアにアップロード
 *  10. postToWordPress(status='future', scheduledDate = now + 2h)
 *  11. SavedArticle を articles/<id>.json に保存（targetKeyword に kw.keyword を必ず入れる。
 *      これにより次回の /ahrefs 表示で投稿日列に反映される）
 *  12. clearFailure(kw) で失敗カウントを消す / history に success
 *
 * 失敗時：
 *  - history に failed
 *  - recordFailure(kw) で autorun/failures.json をインクリメント
 *  - 3 回目で autorun/skipped.json に昇格（以降自動選択されない）
 *
 * テスト用クエリオーバーライド（いずれも CRON_SECRET 必須）：
 *  - ?status=draft|publish|future  (デフォルト future)
 *  - ?delayMinutes=N               (デフォルト 2h = 120 分)
 */
import { NextRequest, NextResponse } from 'next/server'
import { putS3Object } from '@/lib/s3Reference'
import { appendAutoRunHistory } from '@/lib/autoRunQueue'
import {
  generateFirstDraftFromPrompt,
  refineArticleWithGemini,
  generateSlugFromGemini,
} from '@/lib/api/gemini'
import { generateArticleImage } from '@/lib/imageGeneration'
import { postToWordPress } from '@/lib/wordpress'
import type { SavedArticle } from '@/lib/types'
import { loadLatestKeywordsDataset } from '@/lib/ahrefsDataset'
import { analyzeKeywords, type ScoredKeyword } from '@/lib/ahrefsAnalyzer'
import { generateAutoPrompt } from '@/lib/ahrefsAutoPrompt'
import { getAllArticles } from '@/lib/articleStorage'
import {
  buildKeywordWpEntriesByKeyword,
  normalizeKeywordForArticleMatch,
} from '@/lib/keywordPublishIndex'
import {
  clearFailure,
  getSkippedKeywordSet,
  recordFailure,
} from '@/lib/autoRunFailures'

/** Node runtime 必須（@napi-rs/canvas と aws-sdk がバンドル対象） */
export const runtime = 'nodejs'
/** 最大実行時間（Vercel Hobby は 300 秒が上限。画像 & 推敲 & WP 投稿込みで 120〜180 秒程度） */
export const maxDuration = 300
export const dynamic = 'force-dynamic'

function getScheduledDelayHours(): number {
  const raw = process.env.AUTO_PUBLISH_SCHEDULE_DELAY_HOURS?.trim()
  if (raw) {
    const n = parseFloat(raw)
    if (Number.isFinite(n) && n >= 0 && n <= 24) return n
  }
  return 2
}

function computeScheduledDate(overrideMinutes?: number): string {
  const delayMs =
    typeof overrideMinutes === 'number' && Number.isFinite(overrideMinutes) && overrideMinutes >= 0
      ? overrideMinutes * 60 * 1000
      : getScheduledDelayHours() * 60 * 60 * 1000
  return new Date(Date.now() + delayMs).toISOString()
}

/** テスト用オーバーライド（クエリ ?status= / ?delayMinutes=） */
interface RunOverrides {
  status?: 'draft' | 'publish' | 'future'
  delayMinutes?: number
}

function parseOverrides(request: NextRequest): RunOverrides {
  const url = new URL(request.url)
  const out: RunOverrides = {}
  const s = url.searchParams.get('status')?.trim().toLowerCase()
  if (s === 'draft' || s === 'publish' || s === 'future') {
    out.status = s
  }
  const d = url.searchParams.get('delayMinutes')?.trim()
  if (d) {
    const n = parseFloat(d)
    if (Number.isFinite(n) && n >= 0 && n <= 1440) {
      out.delayMinutes = n
    }
  }
  return out
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
  const url = new URL(request.url)
  const q = url.searchParams.get('secret')?.trim()
  return q === expected
}

function estimateWordCount(content: string): number {
  if (!content) return 0
  return content.replace(/\s+/g, '').length
}

/**
 * 最新の狙い目KW データセットから「まだ未投稿 & skipped にもなっていない」KW の
 * 優先度降順・スコア降順の先頭 1 件を返す。無ければ null。
 */
async function pickNextKeyword(): Promise<{
  kw: ScoredKeyword | null
  reason?: 'no-dataset' | 'all-done'
}> {
  const latest = await loadLatestKeywordsDataset()
  if (!latest || !latest.keywords?.length) {
    return { kw: null, reason: 'no-dataset' }
  }

  const scored = analyzeKeywords(latest.keywords).slice().sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    return b.score - a.score
  })

  const [articles, skippedSet] = await Promise.all([
    getAllArticles(),
    getSkippedKeywordSet(),
  ])
  const postedIndex = buildKeywordWpEntriesByKeyword(articles)

  for (const kw of scored) {
    const normKey = normalizeKeywordForArticleMatch(kw.keyword)
    if (postedIndex.has(normKey)) continue
    if (skippedSet.has(normKey)) continue
    return { kw }
  }
  return { kw: null, reason: 'all-done' }
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

async function processKeyword(
  kw: ScoredKeyword,
  overrides: RunOverrides = {},
): Promise<{
  articleId: string
  wordpressPostId: number
  wordpressUrl: string
  scheduledFor: string
  status: 'draft' | 'publish' | 'future'
}> {
  console.log('[auto-publish v2] start keyword', {
    keyword: kw.keyword,
    priority: kw.priority,
    score: kw.score,
    category: kw.assignedCategory,
  })

  // 1. 画面の「記事作成」ボタンと完全に同一のプロンプトを合成
  const autoPrompt = generateAutoPrompt(kw)

  // 2. 一次執筆（Gemini → 失敗時 Claude フォールバックは gemini.ts 側で処理）
  const draft = await generateFirstDraftFromPrompt(autoPrompt, kw.keyword, undefined)

  // 3. 推敲
  const refined = await refineArticleWithGemini(draft.title, draft.content, kw.keyword)

  // 4. スラッグ
  const slug = await generateSlugFromGemini(refined.refinedTitle, kw.keyword, refined.refinedContent)

  // 5. 画像生成
  const image = await generateArticleImage({
    title: refined.refinedTitle,
    content: refined.refinedContent,
  })

  // 6. タイトル焼き込み（@napi-rs/canvas を webpack のバンドル対象から外すため dynamic import）
  const { compositeArticleTitleOnImageServer } = await import('@/lib/compositeArticleTitleOnImageServer')
  const composited = await compositeArticleTitleOnImageServer(image.buffer, refined.refinedTitle)

  // 7. WordPress メディアアップロード
  const media = await uploadImageToWordPressMedia(
    composited.buffer,
    composited.mimeType,
    kw.keyword.slice(0, 40),
  )

  // 8. WordPress へ投稿（デフォルト: future+2h、オーバーライド可）
  const wpStatus: 'draft' | 'publish' | 'future' = overrides.status ?? 'future'
  const scheduledFor =
    wpStatus === 'future' ? computeScheduledDate(overrides.delayMinutes) : new Date().toISOString()
  const postResult = await postToWordPress(
    {
      title: refined.refinedTitle,
      content: refined.refinedContent,
      targetKeyword: kw.keyword,
      slug,
    },
    wpStatus,
    {
      ...(wpStatus === 'future' ? { scheduledDate: scheduledFor } : {}),
      preUploadedMediaId: media.mediaId,
      preUploadedImageUrl: media.sourceUrl,
    },
  )

  // 9. SavedArticle を S3 に保存
  //    targetKeyword と wordpressPostStatus が入っていれば、次回の /ahrefs 画面表示時に
  //    「投稿日」列が自動で反映される（buildKeywordWpEntriesByKeyword が拾う）
  const articleId = `auto-${Date.now()}`
  const nowIso = new Date().toISOString()
  const saved: SavedArticle = {
    id: articleId,
    title: refined.refinedTitle,
    refinedTitle: refined.refinedTitle,
    targetKeyword: kw.keyword,
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
  }
  await putS3Object(`articles/${articleId}.json`, JSON.stringify(saved), 'application/json')

  console.log('[auto-publish v2] posted', {
    articleId,
    wordpressPostId: postResult.id,
    wordpressUrl: postResult.link,
    scheduledFor,
    status: wpStatus,
  })

  return {
    articleId,
    wordpressPostId: postResult.id,
    wordpressUrl: postResult.link,
    scheduledFor,
    status: wpStatus,
  }
}

async function runAutoPublish(overrides: RunOverrides = {}): Promise<NextResponse> {
  const picked = await pickNextKeyword()
  if (!picked.kw) {
    console.log(`[auto-publish v2] skipped (reason=${picked.reason})`)
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: picked.reason,
    })
  }

  const kw = picked.kw
  const startedAt = new Date().toISOString()
  const runId = `run-${Date.now()}`

  try {
    const result = await processKeyword(kw, overrides)
    await clearFailure(kw.keyword)
    const finishedAt = new Date().toISOString()
    await appendAutoRunHistory({
      itemId: runId,
      promptId: 'auto-from-ahrefs-kw',
      keyword: kw.keyword,
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
      keyword: kw.keyword,
      priority: kw.priority,
      score: kw.score,
      result,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[auto-publish v2] failed:', message)
    const finishedAt = new Date().toISOString()
    await appendAutoRunHistory({
      itemId: runId,
      promptId: 'auto-from-ahrefs-kw',
      keyword: kw.keyword,
      startedAt,
      finishedAt,
      status: 'failed',
      error: message,
    })
    const { count, promotedToSkipped } = await recordFailure(kw.keyword, message)
    return NextResponse.json(
      {
        ok: false,
        keyword: kw.keyword,
        error: message,
        failureCount: count,
        promotedToSkipped,
      },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return runAutoPublish(parseOverrides(request))
}

/** GET も許容（GitHub Actions 側の curl が GET でも動作するように保険） */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return runAutoPublish(parseOverrides(request))
}
