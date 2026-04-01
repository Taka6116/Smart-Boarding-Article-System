import type { InternalLinkEntry } from './types'

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/**
 * 記事本文に内部リンクを適用し、HTML（&lt;p&gt; と &lt;br&gt;）に変換して返す。
 * 投稿用コンテンツとして使用する。
 */
export function applyInternalLinksToHtml(
  content: string,
  links: InternalLinkEntry[]
): string {
  const linkedText = applyInternalLinksToText(content, links)
  return plainToHtml(linkedText)
}

/** 記事本文（プレーンテキスト）に内部リンクだけを適用して返す */
export function applyInternalLinksToText(
  content: string,
  links: InternalLinkEntry[]
): string {
  let text = content

  if (links.length > 0) {
    const sorted = [...links].sort((a, b) => b.anchorText.length - a.anchorText.length)
    for (const { anchorText, url } of sorted) {
      if (!anchorText.trim()) continue
      const re = new RegExp(escapeRegex(anchorText), 'u')
      const linkHtml = `<a href="${escapeAttr(url)}">${escapeHtml(anchorText)}</a>`
      text = text.replace(re, linkHtml)
    }
  }

  return text
}

/** テキストをHTMLに変換。既存の <a> タグはエスケープせずそのまま残す */
function plainToHtml(content: string): string {
  return content
    .split(/\n\n+/)
    .map(para => {
      const escaped = escapeParagraph(para)
      return `<p>${escaped}</p>`
    })
    .join('\n')
}

function escapeParagraph(para: string): string {
  const linkRegex = /<a href="[^"]*">[^<]*<\/a>/g
  let lastIndex = 0
  const parts: string[] = []
  let m: RegExpExecArray | null
  while ((m = linkRegex.exec(para)) !== null) {
    parts.push(escapeText(para.slice(lastIndex, m.index)))
    parts.push(m[0])
    lastIndex = m.index + m[0].length
  }
  parts.push(escapeText(para.slice(lastIndex)))
  return parts.join('')
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>\n')
}
