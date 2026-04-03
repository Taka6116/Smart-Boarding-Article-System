import Papa from 'papaparse'

export interface AhrefsKeywordRow {
  keyword: string
  volume: number
  kd: number
  cpc: number
  clicks: number
  parentTopic: string
}

export interface AhrefsDataset {
  id: string
  uploadedAt: string
  fileName: string
  rowCount: number
  keywords: AhrefsKeywordRow[]
}

const HEADER_ALIASES: Record<string, string[]> = {
  keyword: ['keyword', 'keywords', 'キーワード', 'term', 'query'],
  volume: ['volume', 'search volume', 'sv', '検索ボリューム', 'monthly volume'],
  kd: ['kd', 'keyword difficulty', 'difficulty', 'キーワード難易度'],
  cpc: ['cpc', 'cost per click', 'クリック単価'],
  clicks: ['clicks', 'estimated clicks', 'クリック数'],
  parentTopic: ['parent topic', 'parent_topic', 'topic', '親トピック'],
}

function resolveHeader(raw: string): string | null {
  const normalized = raw.trim().toLowerCase().replace(/[_\s]+/g, ' ')
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some(a => a === normalized)) return field
  }
  return null
}

export function parseAhrefsCsv(csvText: string, fileName: string): AhrefsDataset {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  })

  if (!result.data.length) {
    throw new Error('CSVにデータ行がありません')
  }

  const rawHeaders = result.meta.fields ?? Object.keys(result.data[0])
  const headerMap: Record<string, string> = {}
  for (const h of rawHeaders) {
    const resolved = resolveHeader(h)
    if (resolved) headerMap[resolved] = h
  }

  if (!headerMap['keyword']) {
    throw new Error('キーワード列が見つかりません。CSVのヘッダーを確認してください。')
  }

  const keywords: AhrefsKeywordRow[] = []

  for (const row of result.data) {
    const kw = (row[headerMap['keyword']] ?? '').trim()
    if (!kw) continue

    keywords.push({
      keyword: kw,
      volume: parseNum(row[headerMap['volume']]),
      kd: parseNum(row[headerMap['kd']]),
      cpc: parseFloat(row[headerMap['cpc']] ?? '0') || 0,
      clicks: parseNum(row[headerMap['clicks']]),
      parentTopic: (row[headerMap['parentTopic']] ?? '').trim(),
    })
  }

  return {
    id: String(Date.now()),
    uploadedAt: new Date().toISOString(),
    fileName,
    rowCount: keywords.length,
    keywords,
  }
}

function parseNum(val: string | undefined): number {
  if (!val) return 0
  const cleaned = val.replace(/,/g, '').trim()
  const n = parseInt(cleaned, 10)
  return Number.isNaN(n) ? 0 : n
}
