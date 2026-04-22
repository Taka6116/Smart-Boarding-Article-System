import type { SavedArticle } from './types'

/** Ahrefs の KW 行と SavedArticle.targetKeyword を突き合わせるための正規化 */
export function normalizeKeywordForArticleMatch(raw: string): string {
  return raw.normalize('NFKC').trim().toLowerCase()
}

export interface KeywordWpEntry {
  sortKey: number
  displayPart: string
  wordpressUrl?: string
  title: string
  postStatus: 'publish' | 'future' | 'draft'
}

function parseWpInstant(isoOrWp: string | undefined, fallback: string): number {
  if (isoOrWp?.trim()) {
    let s = isoOrWp.trim().replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/, '$1T$2')
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
      s += 'Z'
    }
    const t = Date.parse(s)
    if (!Number.isNaN(t)) return t
  }
  return Date.parse(fallback)
}

/**
 * キーワードごとに、WordPress で公開済みまたは予約済みの記事エントリを列挙する。
 */
export function buildKeywordWpEntriesByKeyword(articles: SavedArticle[]): Map<string, KeywordWpEntry[]> {
  const map = new Map<string, KeywordWpEntry[]>()

  for (const a of articles) {
    const kw = normalizeKeywordForArticleMatch(a.targetKeyword ?? '')
    if (!kw) continue

    const st = a.wordpressPostStatus
    if (st !== 'publish' && st !== 'future' && st !== 'draft') continue
    // draft は wordpressUrl がなくてもよい（ID から判別できないため title のみ表示）

    const instant = parseWpInstant(a.wordpressPublishedAt, a.createdAt)
    if (Number.isNaN(instant)) continue

    const d = new Date(instant)
    const md = `${d.getMonth() + 1}/${d.getDate()}`
    const displayPart =
      st === 'future' ? `${md}（予約）` :
      st === 'draft'  ? `${md}（下書）` :
      `${md}（公開）`

    const arr = map.get(kw) ?? []
    arr.push({
      sortKey: instant,
      displayPart,
      wordpressUrl: a.wordpressUrl,
      title: (a.refinedTitle || a.title || '').trim() || '(無題)',
      postStatus: st as 'publish' | 'future' | 'draft',
    })
    map.set(kw, arr)
  }

  for (const arr of map.values()) {
    arr.sort((x, y) => x.sortKey - y.sortKey)
  }
  return map
}

export function keywordActionButtonLabel(entries: KeywordWpEntry[] | undefined): {
  line: string
  tooltip: string
} {
  if (!entries?.length) {
    return { line: '', tooltip: '' }
  }
  const parts = entries.map(e => e.displayPart)
  const hasFuture  = entries.some(e => e.postStatus === 'future')
  const hasPublish = entries.some(e => e.postStatus === 'publish')
  const hasDraft   = entries.some(e => e.postStatus === 'draft')
  let suffix = '公開済み'
  if (hasDraft && !hasFuture && !hasPublish) suffix = '下書き'
  else if (hasFuture && !hasPublish) suffix = '予約済み'
  else if (hasFuture && hasPublish) suffix = '公開・予約'

  const tooltip = entries
    .map(e => {
      const kind = e.postStatus === 'future' ? '予約' : e.postStatus === 'draft' ? '下書き' : '公開'
      const link = e.wordpressUrl ? `\n${e.wordpressUrl}` : ''
      return `${e.displayPart} ${kind}：${e.title}${link}`
    })
    .join('\n\n')

  return {
    line: `${parts.join('・')} ${suffix}`,
    tooltip,
  }
}
