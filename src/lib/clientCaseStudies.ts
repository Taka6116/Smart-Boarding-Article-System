import { getS3ObjectAsText } from './s3Reference'

export interface ClientCaseStudy {
  sourceUrl: string
  title: string
  companyName?: string
  industry?: string
  employeeSize?: string
  challenges: string[]
  targets: string[]
  effects: string[]
  summary: string
  bodyText?: string
  scrapedAt: string
}

const DEFAULT_CASE_STUDIES_KEY = 'case-studies/client-example-cases.json'
const MAX_CASES_FOR_PROMPT = 6
const MAX_BODY_CHARS_PER_CASE = 450

function getCaseStudiesKey(): string {
  return process.env.CLIENT_CASE_STUDIES_S3_KEY?.trim() || DEFAULT_CASE_STUDIES_KEY
}

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[（）()・/／,、。.!！?？:：\-ー]/g, '')
}

function keywordHints(targetKeyword?: string, prompt?: string): string[] {
  const base = `${targetKeyword ?? ''}\n${prompt ?? ''}`
  const hints = new Set<string>()
  for (const raw of base.split(/[\s,、。・/／|｜]+/)) {
    const t = raw.trim()
    if (t.length >= 2 && t.length <= 30) hints.add(t)
  }

  const domainHints: Array<[RegExp, string[]]> = [
    [/ojt|現場教育|トレーナー/i, ['OJT', '現場教育', 'トレーナー', '標準化']],
    [/新入社員|新人|オンボーディング/i, ['新入社員研修', 'オンボーディング', '内定者研修']],
    [/管理職|マネジメント|リーダー/i, ['管理職研修', '次世代リーダー', 'マネジメント']],
    [/中堅|若手/i, ['中堅社員研修', '若手社員']],
    [/eラーニング|オンライン|lms/i, ['eラーニング', 'LMS', 'オンライン化', '学習進捗']],
    [/人材育成|人財育成|社員教育|研修/i, ['人材育成', '社員教育', '研修', '教育']],
    [/定着|離職|エンゲージメント/i, ['定着', 'エンゲージメント', '離職']],
    [/ばらつき|属人|標準化/i, ['ばらつき', '属人', '標準化']],
  ]
  for (const [re, words] of domainHints) {
    if (re.test(base)) words.forEach(w => hints.add(w))
  }
  return [...hints]
}

function scoreCaseStudy(item: ClientCaseStudy, hints: string[]): number {
  const haystack = normalizeText([
    item.title,
    item.industry,
    item.employeeSize,
    item.summary,
    item.challenges.join(' '),
    item.targets.join(' '),
    item.effects.join(' '),
    item.bodyText,
  ].filter(Boolean).join('\n'))

  let score = 0
  for (const hint of hints) {
    const n = normalizeText(hint)
    if (!n) continue
    if (haystack.includes(n)) score += n.length >= 5 ? 4 : 2
  }
  return score
}

function anonymizeForPrompt(text: string, companyName?: string): string {
  let out = text
  if (companyName) {
    const escaped = companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(escaped, 'g'), 'A社')
  }
  return out
    .replace(/株式会社FCE/g, '株式会社FCE')
    .replace(/Smart Boarding/g, 'Smart Boarding')
    .replace(/スマートボーディング/g, 'スマートボーディング')
    .replace(/株式会社(?!FCE)[^\s、。|｜「」『』（）()]{2,30}/g, 'A社')
    .replace(/[^\s、。|｜「」『』（）()]{2,30}株式会社/g, 'A社')
}

export async function loadClientCaseStudies(): Promise<ClientCaseStudy[]> {
  const result = await getS3ObjectAsText(getCaseStudiesKey())
  if (!result) return []
  try {
    const parsed = JSON.parse(result.content) as { cases?: ClientCaseStudy[] } | ClientCaseStudy[]
    const cases = Array.isArray(parsed) ? parsed : parsed.cases
    return Array.isArray(cases) ? cases : []
  } catch (e) {
    console.error('[ClientCaseStudies] JSON parse error:', e)
    return []
  }
}

export async function buildRelevantClientCaseStudiesBlock(
  targetKeyword?: string,
  prompt?: string,
): Promise<string> {
  const cases = await loadClientCaseStudies()
  if (cases.length === 0) return ''

  const hints = keywordHints(targetKeyword, prompt)
  const ranked = cases
    .map(item => ({ item, score: scoreCaseStudy(item, hints) }))
    .sort((a, b) => b.score - a.score)

  const selected = ranked
    .filter(x => x.score > 0)
    .slice(0, MAX_CASES_FOR_PROMPT)
    .map(x => x.item)

  const fallback = selected.length > 0 ? selected : cases.slice(0, Math.min(3, cases.length))
  if (fallback.length === 0) return ''

  const body = fallback.map((item, idx) => {
    const bodyText = item.bodyText
      ? anonymizeForPrompt(item.bodyText.replace(/\s+/g, ' '), item.companyName).slice(0, MAX_BODY_CHARS_PER_CASE)
      : ''
    const safeTitle = anonymizeForPrompt(item.title, item.companyName)
    return [
      `【事例${idx + 1}】`,
      `タイトル: ${safeTitle}`,
      item.industry ? `業界: ${item.industry}` : '',
      item.employeeSize ? `規模: ${item.employeeSize}` : '',
      item.challenges.length ? `課題: ${anonymizeForPrompt(item.challenges.join(' / '), item.companyName)}` : '',
      item.targets.length ? `対象: ${anonymizeForPrompt(item.targets.join(' / '), item.companyName)}` : '',
      item.effects.length ? `得たい効果・活用: ${anonymizeForPrompt(item.effects.join(' / '), item.companyName)}` : '',
      item.summary ? `概要: ${anonymizeForPrompt(item.summary, item.companyName)}` : '',
      bodyText ? `本文要約素材: ${bodyText}` : '',
      `公開事例リンク: ${item.sourceUrl}`,
    ].filter(Boolean).join('\n')
  }).join('\n\n')

  return `--- 資料（S3）：Smart Boarding公開導入事例JSON（匿名化して利用） ---\n` +
    `以下はクライアント公開サイトの導入事例から抽出した参考情報です。記事本文で使う場合は、企業名を出さず「ある導入企業」「A社（業界）」のように匿名化し、記載内容を誇張・改変しないでください。事例を本文で紹介した場合は、その章の最後に「事例はこちら 公開事例リンクURL」を必ず追加してください。URLはシステム側で「事例はこちら」というリンク文字に変換されます。\n\n${body}`
}
