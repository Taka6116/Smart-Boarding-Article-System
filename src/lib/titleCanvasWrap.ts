/**
 * Canvas measureText 用のタイトル折り返し。JIS 完全準拠ではない実用サブセットの行頭・行末禁則。
 * 全角「。」の直後に改行を挿入し、文の切れ目を優先する（。」・連続「。」・既存改行の直後は除外）。
 * 全角スペース（U+3000）は行頭に置かない。行末が開き括弧のまま次文字が入らないときは括弧を次行へ退避する。
 * 製品名・社名の直前に改行を入れ、1行目を論点・2行目を訴求句に寄せる（幅折りの前段階）。
 * 折り返し後に1字だけの行などがあれば、幅が許すとき前行へ結合して取り残しを抑える。
 */

/** タイトル用：半角 |・全角 ｜ をスペースにし、連続スペースを詰める */
export function stripTitlePipeChars(s: string): string {
  return s.replace(/[|｜]/g, ' ').replace(/ {2,}/g, ' ').trim()
}

/** 句点のあとで次の文へ送るための改行（禁則で 」』 行頭や「。。」を避ける） */
function insertLineBreaksAfterPeriod(text: string): string {
  return text.replace(/。(?=[^\n])(?![。\n」』])/g, '。\n')
}

/** 先頭からこの文字数以上あれば、その直前で改行してよい製品名・社名（先にマッチしたもののみ適用） */
const LEAD_BREAK_PHRASES: readonly { re: RegExp; minPrefix: number }[] = [
  { re: /Smart\s+Boarding/i, minPrefix: 3 },
  { re: /スマートボーディング/, minPrefix: 3 },
  { re: /株式会社FCE/, minPrefix: 3 },
]

function insertBreakBeforeLeadProductPhrase(text: string): string {
  return text
    .split(/\n/)
    .map((segment) => {
      const s = segment.trim()
      if (!s) return segment
      for (const { re, minPrefix } of LEAD_BREAK_PHRASES) {
        const m = re.exec(s)
        if (m?.index != null && m.index >= minPrefix) {
          const head = s.slice(0, m.index).trimEnd()
          const tail = s.slice(m.index)
          return `${head}\n${tail}`
        }
      }
      return segment
    })
    .join('\n')
}

const LINE_HEAD_PROHIBITED = new Set(
  '、。，．！？」』）〕］｝〉》ゝゞーぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヽヾ％‰°′″\u3000'.split(
    '',
  ),
)

const LINE_END_PROHIBITED = new Set('「『（［〔｛《〈【'.split(''))

function segmentGraphemes(s: string): string[] {
  try {
    const seg = new Intl.Segmenter('ja', { granularity: 'grapheme' })
    return Array.from(seg.segment(s), (x) => x.segment)
  } catch {
    return [...s]
  }
}

function headProhibited(firstGrapheme: string): boolean {
  const ch = [...firstGrapheme][0] ?? firstGrapheme
  return LINE_HEAD_PROHIBITED.has(ch)
}

function lineEndProhibited(lastGrapheme: string): boolean {
  const ch = [...lastGrapheme].at(-1) ?? lastGrapheme
  return LINE_END_PROHIBITED.has(ch)
}

/**
 * ブラウザ Canvas とサーバ (@napi-rs/canvas) 両方を受けられる最小 measureText インターフェース。
 * サーバサイド合成では CanvasRenderingContext2D 型が存在しないため、構造的互換だけを要求する。
 */
export interface MeasurableContext {
  measureText: (text: string) => { width: number }
}

/** 1 グラフェムだけの行や短い 2 グラフェム行を前行に結合（例: 「成功戦」+「略」） */
function collapseOrphanTailLines(
  ctx: MeasurableContext,
  lines: string[],
  maxW: number,
): string[] {
  const out = [...lines]
  let i = 1
  while (i < out.length) {
    const cur = out[i]!
    const g = segmentGraphemes(cur)
    if (g.length === 1) {
      const merged = out[i - 1]! + cur
      if (ctx.measureText(merged).width <= maxW) {
        out[i - 1] = merged
        out.splice(i, 1)
        continue
      }
    } else if (g.length === 2 && ctx.measureText(cur).width < maxW * 0.36) {
      const merged = out[i - 1]! + cur
      if (ctx.measureText(merged).width <= maxW) {
        out[i - 1] = merged
        out.splice(i, 1)
        continue
      }
    }
    i++
  }
  return out
}

function wrapSegment(
  ctx: MeasurableContext,
  graphemes: readonly string[],
  maxW: number,
  maxLines: number,
): string[] {
  const lines: string[] = []
  let rem = [...graphemes]

  const fits = (t: string) => ctx.measureText(t).width <= maxW

  while (rem.length > 0 && lines.length < maxLines) {
    if (lines.length === maxLines - 1) {
      lines.push(rem.join(''))
      break
    }

    const lineG: string[] = []
    while (rem.length > 0) {
      const next = rem[0]!
      const trial = [...lineG, next].join('')
      if (lineG.length > 0 && !fits(trial)) break
      lineG.push(rem.shift()!)
    }

    if (lineG.length === 0 && rem.length > 0) {
      lineG.push(rem.shift()!)
    }

    while (
      rem.length > 0 &&
      lineG.length > 0 &&
      lineEndProhibited(lineG[lineG.length - 1]!) &&
      fits([...lineG, rem[0]!].join(''))
    ) {
      lineG.push(rem.shift()!)
    }

    while (
      rem.length > 0 &&
      lineG.length > 0 &&
      lineEndProhibited(lineG[lineG.length - 1]!)
    ) {
      rem.unshift(lineG.pop()!)
    }

    if (lineG.length === 0 && rem.length > 0) {
      lineG.push(rem.shift()!)
    }

    let guard = 0
    while (
      rem.length > 0 &&
      lineG.length > 0 &&
      headProhibited(rem[0]!) &&
      guard < 256
    ) {
      const last = lineG.pop()!
      rem.unshift(last)
      guard++
    }

    if (lineG.length === 0 && rem.length > 0) {
      lineG.push(rem.shift()!)
    }

    lines.push(lineG.join(''))
  }

  return collapseOrphanTailLines(ctx, lines, maxW)
}

export function wrapTitleLines(
  ctx: MeasurableContext,
  titleText: string,
  maxW: number,
  opts?: { maxLines?: number },
): string[] {
  const maxLines = opts?.maxLines ?? 4
  const prepped = insertBreakBeforeLeadProductPhrase(
    insertLineBreaksAfterPeriod(stripTitlePipeChars(titleText)),
  )
  const blocks = prepped.split(/\n/)
  const out: string[] = []

  for (const rawBlock of blocks) {
    const block = rawBlock.trimStart()
    if (block === '') continue
    if (out.length >= maxLines) break
    const g = segmentGraphemes(block)
    const remaining = maxLines - out.length
    const part = wrapSegment(ctx, g, maxW, remaining)
    out.push(...part)
  }

  if (out.length === 0) {
    return ['']
  }
  return out
}
