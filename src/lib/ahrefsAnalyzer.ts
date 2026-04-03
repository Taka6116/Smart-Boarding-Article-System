import type { AhrefsKeywordRow, AhrefsDataset } from './ahrefsCsvParser'

export interface ScoredKeyword extends AhrefsKeywordRow {
  score: number
  category: string
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
  const volumeScore = Math.min(row.volume / 100, 50)
  const kdPenalty = row.kd * 0.5
  const cpcBonus = Math.min(row.cpc / 10, 10)
  return Math.max(0, Math.round(volumeScore - kdPenalty + cpcBonus))
}

export function analyzeKeywords(keywords: AhrefsKeywordRow[]): ScoredKeyword[] {
  return keywords
    .map(kw => ({
      ...kw,
      score: calculateOpportunityScore(kw),
      category: classifyCategory(kw.keyword),
    }))
    .sort((a, b) => b.score - a.score)
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
    map.set(kw.category, (map.get(kw.category) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
}
