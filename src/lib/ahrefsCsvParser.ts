import Papa from 'papaparse'

export interface AhrefsKeywordRow {
  keyword: string
  volume: number
  kd: number
  cpc: number
  clicks: number
  parentTopic: string
  position?: number
  url?: string
  trafficChange?: number
  branded?: boolean
}

export type AhrefsDatasetType = 'keywords' | 'organic'

export interface AhrefsDataset {
  id: string
  uploadedAt: string
  fileName: string
  rowCount: number
  type: AhrefsDatasetType
  keywords: AhrefsKeywordRow[]
}

const HEADER_ALIASES: Record<string, string[]> = {
  keyword: ['keyword', 'keywords', 'キーワード', 'term', 'query'],
  volume: ['volume', 'search volume', 'sv', '検索ボリューム', 'monthly volume', 'gsv'],
  kd: ['kd', 'keyword difficulty', 'difficulty', 'キーワード難易度'],
  cpc: ['cpc', 'cost per click', 'クリック単価'],
  clicks: ['clicks', 'estimated clicks', 'クリック数', 'cps'],
  parentTopic: ['parent topic', 'parent_topic', 'topic', '親トピック', 'parent keyword'],
  position: ['current position', 'position', 'pos'],
  url: ['current url', 'url'],
  trafficChange: ['organic traffic change', 'traffic change'],
  branded: ['branded'],
}

function resolveHeader(raw: string): string | null {
  const normalized = raw.trim().toLowerCase().replace(/[_\s]+/g, ' ')
  if (normalized === '#') return null
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some(a => a === normalized)) return field
  }
  return null
}

function detectType(headerMap: Record<string, string>): AhrefsDatasetType {
  if (headerMap['position'] || headerMap['url'] || headerMap['trafficChange']) {
    return 'organic'
  }
  return 'keywords'
}

export function parseAhrefsCsv(csvText: string, fileName: string): AhrefsDataset {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    delimiter: '',
    quoteChar: '"',
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
    throw new Error(
      `キーワード列が見つかりません。検出されたヘッダー: ${rawHeaders.slice(0, 10).join(', ')}`,
    )
  }

  const type = detectType(headerMap)
  const keywords: AhrefsKeywordRow[] = []

  for (const row of result.data) {
    const kw = (row[headerMap['keyword']] ?? '').trim()
    if (!kw) continue

    const entry: AhrefsKeywordRow = {
      keyword: kw,
      volume: parseNum(row[headerMap['volume']]),
      kd: parseNum(row[headerMap['kd']]),
      cpc: parseFloat(row[headerMap['cpc']] ?? '0') || 0,
      clicks: parseNum(row[headerMap['clicks']]),
      parentTopic: (row[headerMap['parentTopic']] ?? '').trim(),
    }

    if (type === 'organic') {
      if (headerMap['position']) {
        const pos = parseNum(row[headerMap['position']])
        if (pos > 0) entry.position = pos
      }
      if (headerMap['url']) {
        entry.url = (row[headerMap['url']] ?? '').trim() || undefined
      }
      if (headerMap['trafficChange']) {
        entry.trafficChange = parseSignedNum(row[headerMap['trafficChange']])
      }
      if (headerMap['branded']) {
        const val = (row[headerMap['branded']] ?? '').trim().toLowerCase()
        entry.branded = val === 'true' || val === '1'
      }
    }

    keywords.push(entry)
  }

  return {
    id: String(Date.now()),
    uploadedAt: new Date().toISOString(),
    fileName,
    rowCount: keywords.length,
    type,
    keywords,
  }
}

function parseNum(val: string | undefined): number {
  if (!val) return 0
  const cleaned = val.replace(/,/g, '').replace(/"/g, '').trim()
  const n = parseInt(cleaned, 10)
  return Number.isNaN(n) ? 0 : n
}

function parseSignedNum(val: string | undefined): number {
  if (!val) return 0
  const cleaned = val.replace(/,/g, '').replace(/"/g, '').trim()
  const n = parseInt(cleaned, 10)
  return Number.isNaN(n) ? 0 : n
}
