import type { AhrefsKeywordRow } from './ahrefsCsvParser'

export type PriorityLevel = 3 | 2 | 1 | 0

export interface ScoredKeyword extends AhrefsKeywordRow {
  score: number
  assignedCategory: string
  priority: PriorityLevel
  trend: 'up' | 'down' | 'stable'
  trendChangePercent: number
}

export interface TrendKeyword {
  keyword: string
  previousVolume: number
  currentVolume: number
  changeRate: number
  isNew: boolean
}

const CATEGORY_RULES: { category: string; patterns: string[] }[] = [
  { category: '人材育成', patterns: ['人材育成', '人財', '育成計画', '能力開発', 'タレントマネジメント'] },
  { category: 'eラーニング', patterns: ['eラーニング', 'e-learning', 'lms', 'オンライン学習', 'オンライン研修'] },
  { category: '研修', patterns: ['研修', 'トレーニング', 'セミナー', 'ワークショップ'] },
  { category: 'オンボーディング', patterns: ['オンボーディング', '入社', '新人', '新入社員', '内定者'] },
  { category: 'マネジメント', patterns: ['マネジメント', '管理職', '1on1', 'リーダー', 'リーダーシップ', '部下育成'] },
  { category: '評価・制度', patterns: ['評価', '人事制度', '目標管理', 'mbo', 'okr', '人事評価'] },
  { category: 'DX・IT', patterns: ['dx', 'デジタル', 'it', 'rpa', 'erp'] },
  { category: 'コンプライアンス', patterns: ['コンプライアンス', 'ハラスメント', 'パワハラ', 'セクハラ'] },
  { category: 'エンゲージメント', patterns: ['エンゲージメント', 'モチベーション', '従業員満足', '離職', 'リテンション'] },
  { category: 'OJT', patterns: ['ojt', '実地訓練', '職場内訓練'] },
]

export function classifyCategory(keyword: string): string {
  const lower = keyword.toLowerCase()
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some(p => lower.includes(p.toLowerCase()))) {
      return rule.category
    }
  }
  return 'その他'
}

export function calculateOpportunityScore(row: AhrefsKeywordRow): number {
  const volScore = Math.min(row.volume / 1000, 10)
  const kdScore = (100 - row.kd) / 10
  const cpcBonus = Math.min(row.cpc / 500, 2)
  return Math.round((volScore * 4 + kdScore * 5 + cpcBonus * 1) * 10) / 10
}

export function detectSvTrend(svTrend: number[]): { trend: 'up' | 'down' | 'stable'; changePercent: number } {
  if (!svTrend || svTrend.length < 4) return { trend: 'stable', changePercent: 0 }

  const mid = Math.floor(svTrend.length / 2)
  const older = svTrend.slice(0, mid)
  const newer = svTrend.slice(mid)

  const avgOlder = older.reduce((s, v) => s + v, 0) / older.length
  const avgNewer = newer.reduce((s, v) => s + v, 0) / newer.length

  if (avgOlder === 0) {
    return avgNewer > 0 ? { trend: 'up', changePercent: 100 } : { trend: 'stable', changePercent: 0 }
  }

  const changePercent = Math.round(((avgNewer - avgOlder) / avgOlder) * 100)

  if (changePercent >= 10) return { trend: 'up', changePercent }
  if (changePercent <= -10) return { trend: 'down', changePercent }
  return { trend: 'stable', changePercent }
}

export function calcPriority(
  score: number,
  kd: number,
  volume: number,
  trend: 'up' | 'down' | 'stable',
): PriorityLevel {
  if (score >= 50 && kd <= 30 && volume >= 100) return 3
  if (score >= 40 && kd <= 30 && trend === 'up') return 3
  if (score >= 40 && kd <= 50) return 2
  if (kd <= 20 && volume >= 100) return 2
  if (score >= 20) return 1
  return 0
}

/**
 * Site Explorer「オーガニックキーワード」向けの施策スコア。KD は含めない。
 */
export function calculateOrganicActionScore(row: AhrefsKeywordRow): number {
  const pos = row.position
  const tc = row.trafficChange
  const vol = row.volume

  let s = 0
  if (pos != null && pos >= 1) {
    if (pos <= 3) s += 20
    else if (pos <= 10) s += 40
    else if (pos <= 20) s += 32
    else if (pos <= 50) s += 18
    else s += 8
  } else {
    s += 5
  }

  if (tc != null) {
    if (tc <= -500) s += 45
    else if (tc <= -200) s += 35
    else if (tc <= -50) s += 22
    else if (tc < 0) s += 10
    else if (tc > 0) s += Math.min(tc / 50, 15)
  }

  s += Math.min(vol / 400, 22)
  return Math.round(Math.min(s, 99) * 10) / 10
}

/**
 * 競合KW向け優先度（順位・流入変動・ボリューム・SVトレンド）。KD は使わない。
 */
export function calcPriorityOrganic(
  row: AhrefsKeywordRow,
  trend: 'up' | 'down' | 'stable',
): PriorityLevel {
  const vol = row.volume
  const pos = row.position
  const tc = row.trafficChange

  const strongDecline = tc != null && tc <= -150 && vol >= 200
  const top3Erode = pos != null && pos <= 3 && tc != null && tc <= -30 && vol >= 100
  const strikeZone = pos != null && pos >= 4 && pos <= 10
  const almostPage1 = pos != null && pos >= 11 && pos <= 20
  const highVolStrike = strikeZone && vol >= 400
  const highVolAlmost = almostPage1 && vol >= 1200
  const veryHighVolMid = strikeZone && vol >= 2500

  if (strongDecline || top3Erode || highVolStrike || highVolAlmost || veryHighVolMid) return 3

  const moderateDecline = tc != null && tc <= -40 && vol >= 150
  const strikeOk = strikeZone && vol >= 150
  const almostOk = almostPage1 && vol >= 400
  const topStable = pos != null && pos <= 3 && vol >= 200
  const trendUpMid = trend === 'up' && vol >= 800 && pos != null && pos <= 30

  if (moderateDecline || strikeOk || almostOk || topStable || trendUpMid) return 2

  if (vol >= 300 && pos != null && pos <= 30) return 1
  if (vol >= 800) return 1
  if (tc != null && tc < 0 && vol >= 80) return 1

  return 0
}

export function analyzeOrganicKeywords(keywords: AhrefsKeywordRow[], excludeBranded = true): ScoredKeyword[] {
  let filtered = keywords
  if (excludeBranded) {
    filtered = keywords.filter(kw => !kw.branded)
  }
  return filtered
    .map(kw => {
      const score = calculateOrganicActionScore(kw)
      const assignedCategory = kw.category?.trim() || classifyCategory(kw.keyword)
      const { trend, changePercent } = detectSvTrend(kw.svTrend)
      const priority = calcPriorityOrganic(kw, trend)
      return { ...kw, score, assignedCategory, priority, trend, trendChangePercent: changePercent }
    })
    .sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority
      return b.score - a.score
    })
}

export function analyzeKeywords(keywords: AhrefsKeywordRow[], excludeBranded = true): ScoredKeyword[] {
  let filtered = keywords
  if (excludeBranded) {
    filtered = keywords.filter(kw => !kw.branded)
  }
  return filtered
    .map(kw => {
      const score = calculateOpportunityScore(kw)
      const assignedCategory = kw.category?.trim() || classifyCategory(kw.keyword)
      const { trend, changePercent } = detectSvTrend(kw.svTrend)
      const priority = calcPriority(score, kw.kd, kw.volume, trend)
      return { ...kw, score, assignedCategory, priority, trend, trendChangePercent: changePercent }
    })
    .sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority
      return b.score - a.score
    })
}

export function mergeAndAnalyze(allKeywords: AhrefsKeywordRow[][], excludeBranded = true): ScoredKeyword[] {
  const deduped = new Map<string, AhrefsKeywordRow>()
  for (const list of allKeywords) {
    for (const kw of list) {
      const key = kw.keyword.toLowerCase()
      const existing = deduped.get(key)
      if (!existing || kw.volume > existing.volume) {
        deduped.set(key, kw)
      }
    }
  }
  return analyzeKeywords(Array.from(deduped.values()), excludeBranded)
}

export function detectTrends(
  current: AhrefsKeywordRow[],
  previous: AhrefsKeywordRow[]
): TrendKeyword[] {
  const prevMap = new Map(previous.map(k => [k.keyword.toLowerCase(), k]))
  const trends: TrendKeyword[] = []

  for (const kw of current) {
    const key = kw.keyword.toLowerCase()
    const prev = prevMap.get(key)

    if (!prev) {
      if (kw.volume > 100) {
        trends.push({
          keyword: kw.keyword,
          previousVolume: 0,
          currentVolume: kw.volume,
          changeRate: 100,
          isNew: true,
        })
      }
    } else if (prev.volume > 0) {
      const changeRate = ((kw.volume - prev.volume) / prev.volume) * 100
      if (changeRate >= 20) {
        trends.push({
          keyword: kw.keyword,
          previousVolume: prev.volume,
          currentVolume: kw.volume,
          changeRate: Math.round(changeRate),
          isNew: false,
        })
      }
    }
  }

  return trends.sort((a, b) => b.changeRate - a.changeRate)
}

export function getCategories(keywords: ScoredKeyword[]): { category: string; count: number }[] {
  const map = new Map<string, number>()
  for (const kw of keywords) {
    map.set(kw.assignedCategory, (map.get(kw.assignedCategory) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
}
