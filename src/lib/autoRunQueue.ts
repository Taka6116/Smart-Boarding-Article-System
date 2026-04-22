/**
 * 自動投稿キュー。S3 の `autorun/queue.json` に FIFO で保持する。
 * 1 回の Cron 実行で先頭 1 件を消費し、成功したらキューから取り除く。
 * 失敗時はキューの先頭に残したまま history に失敗エントリを書き、次回 Cron のリトライ対象にする。
 */
import { getS3ObjectAsText, putS3Object } from '@/lib/s3Reference'

const QUEUE_KEY = 'autorun/queue.json'
const HISTORY_PREFIX = 'autorun/history/'

export interface AutoRunQueueItem {
  /** 固有 ID（Date.now ベースで呼び出し側が採番） */
  id: string
  /** S3 `prompts/` に保存されているプロンプト ID */
  promptId: string
  /** ターゲットキーワード（記事の主題。必須） */
  keyword: string
  /** 任意：WordPress タグ名（省略時は自動投稿では付けない） */
  wordpressTags?: string[]
  /** 任意：WordPress カテゴリー ID（省略時は .env の WORDPRESS_CATEGORY_ID） */
  wordpressCategoryIds?: number[]
  /** キューに積まれた時刻 ISO */
  enqueuedAt: string
  /** 失敗で先頭に残っている場合の連続失敗回数 */
  failureCount?: number
  /** 最新の失敗メッセージ（デバッグ用） */
  lastErrorMessage?: string
}

export interface AutoRunHistoryEntry {
  itemId: string
  promptId: string
  keyword: string
  startedAt: string
  finishedAt: string
  /** 'success' | 'failed' */
  status: 'success' | 'failed'
  /** 生成された記事 ID（失敗時は省略） */
  articleId?: string
  /** WordPress 投稿 ID（成功時） */
  wordpressPostId?: number
  /** WordPress 投稿 URL（成功時） */
  wordpressUrl?: string
  /** 予約公開日時（ISO, 成功時） */
  scheduledFor?: string
  /** 失敗メッセージ（失敗時） */
  error?: string
  /** どの生成ルート（gemini / claude）で最終的に生成されたか（把握できる範囲で） */
  generationPath?: string
}

async function loadQueue(): Promise<AutoRunQueueItem[]> {
  const result = await getS3ObjectAsText(QUEUE_KEY)
  if (!result) return []
  try {
    const parsed = JSON.parse(result.content)
    if (Array.isArray(parsed)) {
      return parsed.filter((x) => x && typeof x === 'object' && typeof x.id === 'string')
    }
    return []
  } catch {
    console.warn('[autorun] queue.json の JSON パースに失敗しました。空として扱います。')
    return []
  }
}

async function saveQueue(items: AutoRunQueueItem[]): Promise<boolean> {
  return putS3Object(QUEUE_KEY, JSON.stringify(items, null, 2), 'application/json')
}

/** キュー全体を取得（読み取り専用・監視／UI 表示用） */
export async function getAutoRunQueue(): Promise<AutoRunQueueItem[]> {
  return loadQueue()
}

/** 末尾へ追加 */
export async function enqueueAutoRun(
  item: Omit<AutoRunQueueItem, 'id' | 'enqueuedAt'> & { id?: string },
): Promise<AutoRunQueueItem> {
  const now = new Date().toISOString()
  const newItem: AutoRunQueueItem = {
    id: item.id ?? `arq-${Date.now()}`,
    promptId: item.promptId,
    keyword: item.keyword,
    enqueuedAt: now,
    ...(item.wordpressTags ? { wordpressTags: item.wordpressTags } : {}),
    ...(item.wordpressCategoryIds ? { wordpressCategoryIds: item.wordpressCategoryIds } : {}),
  }
  const existing = await loadQueue()
  const updated = [...existing, newItem]
  const ok = await saveQueue(updated)
  if (!ok) throw new Error('キュー保存に失敗しました（S3 put error）')
  return newItem
}

/** 指定 ID を削除 */
export async function removeAutoRunItem(id: string): Promise<boolean> {
  const existing = await loadQueue()
  const updated = existing.filter((x) => x.id !== id)
  if (updated.length === existing.length) return false
  return saveQueue(updated)
}

/** 先頭 1 件だけ抜き取り、残りを保存（キューを前進させる） */
export async function shiftAutoRunItem(): Promise<AutoRunQueueItem | null> {
  const existing = await loadQueue()
  if (existing.length === 0) return null
  const [head, ...rest] = existing
  await saveQueue(rest)
  return head ?? null
}

/** 先頭 1 件をのぞき見る（消費せず） */
export async function peekAutoRunItem(): Promise<AutoRunQueueItem | null> {
  const existing = await loadQueue()
  return existing[0] ?? null
}

/**
 * 失敗時に先頭へ戻す（失敗カウントをインクリメント）。
 * 連続失敗数が maxFailures を超えた場合は先頭から落とし、history にのみ残す。
 */
export async function requeueHeadAfterFailure(
  item: AutoRunQueueItem,
  errorMessage: string,
  maxFailures = 3,
): Promise<{ requeued: boolean; failureCount: number }> {
  const failureCount = (item.failureCount ?? 0) + 1
  if (failureCount >= maxFailures) {
    console.error(
      `[autorun] 連続失敗が ${failureCount} 回に達したため ${item.id} をキューから除外します`,
    )
    return { requeued: false, failureCount }
  }
  const existing = await loadQueue()
  const updated: AutoRunQueueItem[] = [
    { ...item, failureCount, lastErrorMessage: errorMessage.slice(0, 500) },
    ...existing,
  ]
  const ok = await saveQueue(updated)
  if (!ok) {
    console.error('[autorun] requeue 時の保存に失敗しました')
    return { requeued: false, failureCount }
  }
  return { requeued: true, failureCount }
}

/** history に 1 件書き出す（日別 JSONL 風だが 1 ファイル = 1 エントリの JSON 配列として扱う） */
export async function appendAutoRunHistory(entry: AutoRunHistoryEntry): Promise<void> {
  const ymd = entry.finishedAt.slice(0, 10) // YYYY-MM-DD
  const key = `${HISTORY_PREFIX}${ymd}.json`
  const existing = await getS3ObjectAsText(key)
  let arr: AutoRunHistoryEntry[] = []
  if (existing) {
    try {
      const parsed = JSON.parse(existing.content)
      if (Array.isArray(parsed)) arr = parsed
    } catch {
      /* skip malformed */
    }
  }
  arr.push(entry)
  await putS3Object(key, JSON.stringify(arr, null, 2), 'application/json')
}
