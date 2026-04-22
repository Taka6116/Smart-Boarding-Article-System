/**
 * 自動投稿の失敗カウント管理（v2 KW テーブル駆動）。
 *
 * 構成：
 *   - autorun/failures.json … 未達 KW の失敗回数 {normalizedKw: {count, lastError, lastAt}}
 *   - autorun/skipped.json  … 3 回連続失敗した KW（正規化キー）のリスト
 *
 * 呼び出し元ロジック：
 *   1. pickNextKeyword() は skipped.json に含まれる KW を除外して選ぶ
 *   2. 実行成功時に clearFailure(kw) を呼ぶ
 *   3. 実行失敗時に recordFailure(kw, error) を呼ぶ。count >= 3 なら自動的に skipped に昇格。
 */
import { getS3ObjectAsText, putS3Object } from './s3Reference'
import { normalizeKeywordForArticleMatch } from './keywordPublishIndex'

const FAILURES_KEY = 'autorun/failures.json'
const SKIPPED_KEY = 'autorun/skipped.json'

/** 3 回連続失敗で skipped に昇格 */
const MAX_FAILURES_BEFORE_SKIP = 3

interface FailureEntry {
  count: number
  lastError: string
  lastAt: string
  keyword: string
}

type FailuresMap = Record<string, FailureEntry>

async function loadJson<T>(key: string, fallback: T): Promise<T> {
  const r = await getS3ObjectAsText(key)
  if (!r) return fallback
  try {
    return JSON.parse(r.content) as T
  } catch {
    return fallback
  }
}

async function saveJson(key: string, data: unknown): Promise<void> {
  await putS3Object(key, JSON.stringify(data, null, 2), 'application/json')
}

async function loadFailures(): Promise<FailuresMap> {
  return loadJson<FailuresMap>(FAILURES_KEY, {})
}

async function loadSkippedSet(): Promise<Set<string>> {
  const list = await loadJson<string[]>(SKIPPED_KEY, [])
  return new Set(list.map(s => normalizeKeywordForArticleMatch(s)))
}

/**
 * skipped.json に含まれる正規化済み KW のセット。
 * pickNextKeyword の除外判定に使う。
 */
export async function getSkippedKeywordSet(): Promise<Set<string>> {
  return loadSkippedSet()
}

/**
 * 成功時に呼ぶ：失敗エントリを消す（skipped にはしない）。
 */
export async function clearFailure(keyword: string): Promise<void> {
  const norm = normalizeKeywordForArticleMatch(keyword)
  const failures = await loadFailures()
  if (failures[norm]) {
    delete failures[norm]
    await saveJson(FAILURES_KEY, failures)
  }
}

/**
 * 失敗時に呼ぶ：失敗カウントを++。3 回に達したら skipped.json に昇格し、
 * failures からは削除する（二重カウント防止）。
 * 戻り値は現時点の count（skipped 昇格後は MAX_FAILURES_BEFORE_SKIP 扱い）。
 */
export async function recordFailure(
  keyword: string,
  error: string,
): Promise<{ count: number; promotedToSkipped: boolean }> {
  const norm = normalizeKeywordForArticleMatch(keyword)
  const failures = await loadFailures()
  const prev = failures[norm]
  const nextCount = (prev?.count ?? 0) + 1

  if (nextCount >= MAX_FAILURES_BEFORE_SKIP) {
    // skipped へ昇格
    const skipped = await loadJson<string[]>(SKIPPED_KEY, [])
    if (!skipped.includes(keyword)) {
      skipped.push(keyword)
      await saveJson(SKIPPED_KEY, skipped)
    }
    delete failures[norm]
    await saveJson(FAILURES_KEY, failures)
    return { count: nextCount, promotedToSkipped: true }
  }

  failures[norm] = {
    count: nextCount,
    lastError: error.slice(0, 1000),
    lastAt: new Date().toISOString(),
    keyword,
  }
  await saveJson(FAILURES_KEY, failures)
  return { count: nextCount, promotedToSkipped: false }
}
