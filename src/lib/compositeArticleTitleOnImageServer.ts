/**
 * 記事アイキャッチ用に画像へタイトルテキストをサーバサイドで焼き込む。
 * 自動投稿フロー（/api/auto-publish/run）で使用する。クライアント側 compositeArticleTitleOnImage と
 * 同じ禁則・折り返しルール（wrapTitleLines）を共有する。
 *
 * - @napi-rs/canvas に Noto Sans JP Bold (public/fonts/NotoSansJP-Bold.ttf) を登録して描画する
 * - Vercel の関数バンドルに public/ は含まれないため、実行時は process.cwd() を起点に解決
 */
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { wrapTitleLines } from '@/lib/titleCanvasWrap'

/** ランタイムの Node runtime でのみ import される（edge では使えない） */
type NapiCanvas = {
  createCanvas: (w: number, h: number) => {
    getContext: (type: '2d') => {
      drawImage: (img: unknown, x: number, y: number, w: number, h: number) => void
      createLinearGradient: (x0: number, y0: number, x1: number, y1: number) => {
        addColorStop: (offset: number, color: string) => void
      }
      fillStyle: string | unknown
      fillRect: (x: number, y: number, w: number, h: number) => void
      font: string
      shadowColor: string
      shadowBlur: number
      fillText: (text: string, x: number, y: number) => void
      measureText: (text: string) => { width: number }
    }
    toBuffer: (mime: 'image/jpeg' | 'image/png', quality?: number) => Buffer
  }
  loadImage: (src: Buffer | string) => Promise<{ width: number; height: number }>
  GlobalFonts: {
    registerFromPath: (filePath: string, family?: string) => boolean
    has?: (family: string) => boolean
  }
}

let fontRegistered = false

async function ensureFontRegistered(napi: NapiCanvas): Promise<void> {
  if (fontRegistered) return
  const candidates = [
    path.join(process.cwd(), 'public', 'fonts', 'NotoSansJP-Bold.ttf'),
    path.join(process.cwd(), '.next', 'server', 'public', 'fonts', 'NotoSansJP-Bold.ttf'),
  ]
  for (const p of candidates) {
    try {
      await fs.access(p)
      napi.GlobalFonts.registerFromPath(p, 'NotoSansJPBold')
      console.log(`[composite-server] font registered from ${p}`)
      fontRegistered = true
      return
    } catch {
      /* try next */
    }
  }
  console.warn(
    '[composite-server] Noto Sans JP Bold が見つかりません。public/fonts/NotoSansJP-Bold.ttf を配置してください。',
  )
}

export interface ServerCompositeResult {
  /** JPEG バイナリ */
  buffer: Buffer
  mimeType: 'image/jpeg'
  width: number
  height: number
}

/**
 * 画像バイナリにタイトルを焼き込み、JPEG バッファを返す。
 * @param imageBuffer 元画像のバイナリ（JPEG/PNG どちらでも可）
 * @param titleText   記事タイトル（縦棒除去・句点改行・禁則処理は wrapTitleLines が実施）
 */
export async function compositeArticleTitleOnImageServer(
  imageBuffer: Buffer,
  titleText: string,
): Promise<ServerCompositeResult> {
  const napi = (await import('@napi-rs/canvas')) as unknown as NapiCanvas
  await ensureFontRegistered(napi)

  const img = await napi.loadImage(imageBuffer)
  const W = img.width || 1280
  const H = img.height || 720

  const canvas = napi.createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  ctx.drawImage(img, 0, 0, W, H)

  const gradH = H * 0.58
  const grad = ctx.createLinearGradient(0, H - gradH, 0, H)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(1, 'rgba(0,0,0,0.74)')
  ctx.fillStyle = grad
  ctx.fillRect(0, H - gradH, W, gradH)

  const pad = W * 0.04
  const maxW = W - pad * 2
  const fontSize = Math.round(W * 0.036)
  ctx.font = `bold ${fontSize}px "NotoSansJPBold","Noto Sans JP","Hiragino Sans","Yu Gothic",sans-serif`
  ctx.fillStyle = '#FFFFFF'
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 10

  const lines = wrapTitleLines(ctx, titleText, maxW, { maxLines: 4 })

  const lh = fontSize * 1.42
  const totalH = lines.length * lh
  const startY = H - pad - totalH + fontSize

  lines.forEach((line, i) => {
    ctx.fillText(line, pad, startY + i * lh)
  })

  const buffer = canvas.toBuffer('image/jpeg', 92)
  return { buffer, mimeType: 'image/jpeg', width: W, height: H }
}
