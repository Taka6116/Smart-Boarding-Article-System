import { NextRequest, NextResponse } from 'next/server'

/**
 * WordPress メディアライブラリへの画像アップロード専用エンドポイント
 * 投稿APIと分離することで:
 * - ボディサイズ問題を独立して処理
 * - アップロード失敗を明確にユーザーへ通知
 * - タイムアウトリスクを分散
 */

function wpRestUrl(wpUrl: string, route: string): string {
  const base = wpUrl.replace(/\/+$/, '')
  const cleanRoute = route.startsWith('/') ? route : `/${route}`
  return `${base}/?rest_route=${encodeURIComponent(cleanRoute)}`
}

function forceHttps(url: string): string {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://')
  }
  return url
}

export async function POST(request: NextRequest) {
  const wpUrl = process.env.WORDPRESS_URL?.trim()
  const username = process.env.WORDPRESS_USERNAME?.trim()
  const appPassword = process.env.WORDPRESS_APP_PASSWORD?.trim()

  if (!wpUrl || !username || !appPassword) {
    return NextResponse.json(
      { error: 'WordPressの環境変数が設定されていません' },
      { status: 500 },
    )
  }

  let imageBase64: string | undefined
  let mimeType = 'image/jpeg'
  let articleTitle: string | undefined

  try {
    const body = await request.json()
    imageBase64 = body?.imageBase64
    mimeType = body?.mimeType ?? 'image/jpeg'
    articleTitle = body?.articleTitle ?? 'sb-image'
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です' }, { status: 400 })
  }

  if (!imageBase64) {
    return NextResponse.json({ error: '画像データがありません' }, { status: 400 })
  }

  const credentials = Buffer.from(`${username}:${appPassword}`).toString('base64')
  const ext = mimeType.split('/')[1] ?? 'jpg'
  const fileName = `sb-${Date.now()}.${ext}`

  try {
    const buffer = Buffer.from(imageBase64, 'base64')

    console.log(`[upload-media] アップロード開始: ${fileName}, size=${buffer.byteLength}bytes`)

    const res = await fetch(wpRestUrl(wpUrl, '/wp/v2/media'), {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Type': mimeType,
      },
      body: buffer,
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      const msg = (errData as { message?: string }).message ?? res.statusText
      console.error(`[upload-media] アップロード失敗: ${res.status} ${msg}`)
      return NextResponse.json(
        { error: `メディアアップロード失敗 (${res.status}): ${msg}` },
        { status: res.status },
      )
    }

    const media = await res.json()
    const sourceUrl = forceHttps(media.source_url ?? media.link ?? '')
    console.log(`[upload-media] アップロード成功: mediaId=${media.id}, url=${sourceUrl}`)

    return NextResponse.json({
      mediaId: media.id,
      sourceUrl,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[upload-media] エラー:', msg)
    return NextResponse.json({ error: `アップロードエラー: ${msg}` }, { status: 500 })
  }
}
