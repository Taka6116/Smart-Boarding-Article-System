import { promises as fs } from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')
const HISTORY_FILE = path.join(DATA_DIR, 'intro-history.json')
const MAX_ENTRIES = 20

interface IntroHistoryEntry {
  date: string
  keyword: string
  firstSentence: string
}

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
  } catch { /* already exists */ }
}

export async function loadIntroHistory(): Promise<IntroHistoryEntry[]> {
  try {
    const raw = await fs.readFile(HISTORY_FILE, 'utf-8')
    const data = JSON.parse(raw)
    if (Array.isArray(data)) return data.slice(-MAX_ENTRIES)
  } catch { /* file doesn't exist or is invalid */ }
  return []
}

export async function saveIntroEntry(keyword: string, firstSentence: string): Promise<void> {
  await ensureDataDir()
  const entries = await loadIntroHistory()
  entries.push({
    date: new Date().toISOString(),
    keyword,
    firstSentence,
  })
  const trimmed = entries.slice(-MAX_ENTRIES)
  await fs.writeFile(HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf-8')
}

export function extractFirstSentence(content: string): string {
  if (!content) return ''
  const cleaned = content.replace(/^[\s\n]+/, '')
  const match = cleaned.match(/^(.+?[。.！!？?])/)
  if (match) return match[1]
  const firstLine = cleaned.split('\n')[0] ?? ''
  return firstLine.slice(0, 120)
}

export function buildUsedIntrosBlock(entries: IntroHistoryEntry[]): string {
  if (entries.length === 0) return ''
  const lines = entries
    .slice(-10)
    .map((e, i) => `${i + 1}.「${e.firstSentence}」`)
    .join('\n')
  return `■ 使用禁止：過去の記事で使った導入（類似の構造・語彙も不可）
${lines}
※上記と似た語彙・構造・トーンの書き出しは使用しないこと。`
}
