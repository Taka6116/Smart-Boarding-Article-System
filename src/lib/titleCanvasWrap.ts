/**
 * Canvas measureText 用のタイトル折り返し。JIS 完全準拠ではない実用サブセットの行頭・行末禁則。
 */

const LINE_HEAD_PROHIBITED = new Set(
  '、。，．！？」』）〕］｝〉》ゝゞーぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヽヾ％‰°′″'.split(
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

function wrapSegment(
  ctx: CanvasRenderingContext2D,
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

  return lines
}

export function wrapTitleLines(
  ctx: CanvasRenderingContext2D,
  titleText: string,
  maxW: number,
  opts?: { maxLines?: number },
): string[] {
  const maxLines = opts?.maxLines ?? 4
  const blocks = titleText.split(/\n/)
  const out: string[] = []

  for (const block of blocks) {
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
