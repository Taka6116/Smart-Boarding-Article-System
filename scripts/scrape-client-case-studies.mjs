/**
 * Smart Boarding 導入事例ページを一度だけスクレイピングし、S3にJSON保存する。
 *
 * Usage:
 *   node scripts/scrape-client-case-studies.mjs
 *
 * Env (.env.local):
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 *   AWS_REGION
 *   S3_BUCKET_NAME
 *   CLIENT_CASE_STUDIES_S3_KEY (optional, default: case-studies/client-example-cases.json)
 */
import { readFileSync } from 'fs'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const BASE_URL = 'https://www.smartboarding.net'
const INDEX_URL = `${BASE_URL}/example/`
const DEFAULT_KEY = 'case-studies/client-example-cases.json'
const MAX_ARCHIVE_PAGES = Number.parseInt(process.env.MAX_CASE_STUDY_ARCHIVE_PAGES || '8', 10)
const REQUEST_DELAY_MS = Number.parseInt(process.env.CASE_STUDY_SCRAPE_DELAY_MS || '500', 10)

function loadEnv() {
  let text = ''
  try {
    text = readFileSync('.env.local', 'utf8')
  } catch {
    return process.env
  }
  const env = { ...process.env }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const i = trimmed.indexOf('=')
    const key = trimmed.slice(0, i).trim()
    let value = trimmed.slice(i + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function decodeHtml(input) {
  return String(input || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

function stripTags(html) {
  return decodeHtml(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|h[1-6]|div|section|article)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function absoluteUrl(href) {
  try {
    return new URL(href, BASE_URL).toString().replace(/#.*$/, '')
  } catch {
    return ''
  }
}

function extractExampleLinks(html) {
  const urls = new Set()
  const re = /href=["']([^"']+)["']/gi
  let match
  while ((match = re.exec(html)) !== null) {
    const url = absoluteUrl(match[1])
    if (!url) continue
    const path = new URL(url).pathname
    if (!path.startsWith('/example/')) continue
    if (path === '/example/' || path === '/example') continue
    if (/\/page\/\d+\/?$/.test(path)) continue
    urls.add(url.replace(/\?.*$/, ''))
  }
  return [...urls]
}

function pickFirst(html, patterns) {
  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) return stripTags(m[1]).replace(/\s+/g, ' ').trim()
  }
  return ''
}

function uniqueClean(items) {
  return [...new Set(items.map(s => String(s || '').replace(/\s+/g, ' ').trim()).filter(Boolean))]
}

function extractAfterLabels(text, labels) {
  const out = []
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*[:：]?\\s*([^\\n]{6,180})`, 'g')
    let match
    while ((match = re.exec(text)) !== null) {
      out.push(match[1])
    }
  }
  return uniqueClean(out)
}

function inferIndustry(text) {
  const known = [
    '不動産業', '製造業', '情報通信・IT', '卸売業', '小売業', '医療・福祉',
    '専門・技術サービス業', '飲食サービス業', '学習支援業', 'コンサルティング',
    '航空宇宙産業', '米穀卸売業', '医療介護事業', 'ITソリューション', '人材サービス業',
  ]
  return known.find(x => text.includes(x)) || ''
}

function inferEmployeeSize(text) {
  const m = text.match(/(?:1〜29名|30〜99名|100〜299名|300〜999名|1000〜4999名|5000名以上)/)
  return m?.[0] || ''
}

function summarize(text) {
  const cleaned = text
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
  return cleaned.slice(0, 700)
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'SmartBoardingArticleSystem/1.0 (+case-study-ingestion)',
      Accept: 'text/html,application/xhtml+xml',
    },
  })
  if (!res.ok) throw new Error(`Fetch failed ${res.status}: ${url}`)
  return res.text()
}

async function collectLinks() {
  const links = new Set()
  for (let page = 1; page <= MAX_ARCHIVE_PAGES; page++) {
    const url = page === 1 ? INDEX_URL : `${INDEX_URL}page/${page}/`
    try {
      const html = await fetchHtml(url)
      const pageLinks = extractExampleLinks(html)
      const before = links.size
      pageLinks.forEach(u => links.add(u))
      console.log(`archive ${page}: ${pageLinks.length} links (${links.size} total)`)
      if (page > 1 && links.size === before) break
      await sleep(REQUEST_DELAY_MS)
    } catch (e) {
      console.warn(`archive ${page}: skip (${e.message})`)
      break
    }
  }
  return [...links]
}

function parseCasePage(url, html) {
  const text = stripTags(html)
  const title = pickFirst(html, [
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
    /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i,
    /<title[^>]*>([\s\S]*?)<\/title>/i,
  ]).replace(/\s*\|\s*企業向けeラーニング[\s\S]*$/, '')

  const companyName = pickFirst(html, [
    /class=["'][^"']*(?:company|name|client)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
  ])

  const challenges = extractAfterLabels(text, ['課題', '導入前の課題'])
  const targets = extractAfterLabels(text, ['対象'])
  const effects = extractAfterLabels(text, ['得たい効果', '効果', '運用・活用'])

  return {
    sourceUrl: url,
    title: title || text.slice(0, 80),
    ...(companyName ? { companyName } : {}),
    industry: inferIndustry(text),
    employeeSize: inferEmployeeSize(text),
    challenges,
    targets,
    effects,
    summary: summarize(text),
    bodyText: text.slice(0, 2500),
    scrapedAt: new Date().toISOString(),
  }
}

async function main() {
  const env = loadEnv()
  const bucket = env.S3_BUCKET_NAME
  if (!bucket) {
    throw new Error('S3_BUCKET_NAME が .env.local または環境変数に設定されていません')
  }
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY が設定されていません')
  }

  const links = await collectLinks()
  if (links.length === 0) {
    throw new Error('導入事例の詳細ページURLを抽出できませんでした')
  }

  const cases = []
  for (const [idx, url] of links.entries()) {
    try {
      const html = await fetchHtml(url)
      const item = parseCasePage(url, html)
      cases.push(item)
      console.log(`case ${idx + 1}/${links.length}: ${item.title}`)
      await sleep(REQUEST_DELAY_MS)
    } catch (e) {
      console.warn(`case skip: ${url} (${e.message})`)
    }
  }

  const payload = {
    source: INDEX_URL,
    scrapedAt: new Date().toISOString(),
    count: cases.length,
    cases,
  }

  const key = env.CLIENT_CASE_STUDIES_S3_KEY || DEFAULT_KEY
  const client = new S3Client({
    region: env.AWS_REGION || 'ap-northeast-1',
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  })
  const body = JSON.stringify(payload, null, 2)
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: 'application/json; charset=utf-8',
  }))

  console.log(`✓ uploaded: s3://${bucket}/${key}`)
  console.log(`✓ cases: ${cases.length}, bytes: ${body.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
