import { NextResponse } from 'next/server'
import { getSupervisorImageUrl } from '@/lib/wordpress'
import { getS3ObjectAsBuffer, getS3BucketName } from '@/lib/s3Reference'

/**
 * 監修者画像をサーバー経由で返す。
 * S3の場合は認証付きGetObjectを使用（バケット非公開でも可）。
 * プレビューで <img src="/api/supervisor-image" /> とすると表示できる。
 */
export async function GET() {
  try {
    const imageUrl = getSupervisorImageUrl()
    if (!imageUrl) {
      return NextResponse.json({ error: 'Supervisor image URL not configured' }, { status: 503 })
    }

    const bucket = getS3BucketName()
    const region = process.env.AWS_REGION ?? 'ap-northeast-1'
    let parsed: URL | null = null
    try {
      parsed = new URL(imageUrl)
    } catch {
      // ignore
    }
    const isS3SameBucket =
      bucket &&
      parsed &&
      parsed.hostname === `${bucket}.s3.${region}.amazonaws.com`

    if (isS3SameBucket && parsed) {
      const key = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
      const result = await getS3ObjectAsBuffer(key)
      if (!result) {
        return new NextResponse(null, { status: 404 })
      }
      const contentType = result.contentType ?? 'image/png'
      return new NextResponse(Buffer.from(result.body), {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=60',
        },
      })
    }

    const res = await fetch(imageUrl, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })
    if (!res.ok) {
      return new NextResponse(null, { status: res.status })
    }
    const blob = await res.blob()
    const contentType = res.headers.get('content-type') || 'image/png'
    return new NextResponse(blob, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=60',
      },
    })
  } catch {
    return new NextResponse(null, { status: 502 })
  }
}
