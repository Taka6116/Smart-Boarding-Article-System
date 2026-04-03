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
