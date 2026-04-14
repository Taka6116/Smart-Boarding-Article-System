/**
 * 記事アイキャッチ用に画像へタイトルテキストを焼き込む（クライアント専用・Canvas）。
 * プレビュー表示・DL・session 保存前の合成に利用する。
 */
export async function compositeArticleTitleOnImage(
  imageDataUrl: string,
  titleText: string
): Promise<string> {
  if (typeof window === 'undefined') return imageDataUrl

  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = () => {
      const W = img.naturalWidth || 1280
      const H = img.naturalHeight || 720
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, W, H)

      const gradH = H * 0.58
      const grad = ctx.createLinearGradient(0, H - gradH, 0, H)
      grad.addColorStop(0, 'rgba(0,0,0,0)')
      grad.addColorStop(1, 'rgba(0,0,0,0.74)')
      ctx.fillStyle = grad
      ctx.fillRect(0, H - gradH, W, gradH)

      const pad = W * 0.06
      const maxW = W - pad * 2
      const fontSize = Math.round(W * 0.036)
      ctx.font = `bold ${fontSize}px "Noto Sans JP","Hiragino Sans","Yu Gothic",sans-serif`
      ctx.fillStyle = '#FFFFFF'
      ctx.shadowColor = 'rgba(0,0,0,0.55)'
      ctx.shadowBlur = 10

      const chars = [...titleText]
      const lines: string[] = []
      let cur = ''
      for (const ch of chars) {
        if (ctx.measureText(cur + ch).width > maxW && cur) {
          lines.push(cur)
          cur = ch
          if (lines.length >= 3) break
        } else {
          cur += ch
        }
      }
      if (cur && lines.length < 4) lines.push(cur)

      const lh = fontSize * 1.42
      const totalH = lines.length * lh
      const startY = H - pad - totalH + fontSize

      lines.forEach((line, i) => {
        ctx.fillText(line, pad, startY + i * lh)
      })

      resolve(canvas.toDataURL('image/jpeg', 0.92))
    }
    img.onerror = () => resolve(imageDataUrl)
    img.crossOrigin = 'anonymous'
    img.src = imageDataUrl
  })
}
