import { NextRequest, NextResponse } from 'next/server'
import { decodeHtmlEntities, type WpTagListItem } from '@/lib/wpTagList'

export const dynamic = 'force-dynamic'

export type { WpTagListItem }

/**
 * GET /api/wordpress/tags?per_page=100&page=1
 * WordPress のタグを使用回数降順で取得（管理画面の「よく使われているタグ」に相当）。
 */
export async function GET(request: NextRequest) {
  const wpUrl = process.env.WORDPRESS_URL?.trim()
  const username = process.env.WORDPRESS_USERNAME?.trim()
  const appPassword = process.env.WORDPRESS_APP_PASSWORD?.trim()

  if (!wpUrl || !username || !appPassword) {
    return NextResponse.json(
      {
        error: 'WordPress の環境変数（WORDPRESS_URL 等）が設定されていません',
        tags: [] as WpTagListItem[],
      },
      { status: 503 }
    )
  }

  const { searchParams } = new URL(request.url)
  const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get('per_page') || '100', 10) || 100))
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)

  const base = wpUrl.replace(/\/$/, '')
  const url = `${base}/wp-json/wp/v2/tags?per_page=${perPage}&page=${page}&orderby=count&order=desc&_fields=id,name,slug,count`

  const credentials = Buffer.from(`${username}:${appPassword}`, 'utf8').toString('base64')

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${credentials}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error('[wp/tags]', res.status, errText.slice(0, 500))
      return NextResponse.json(
        {
          error: `WordPress タグ一覧の取得に失敗しました (${res.status})`,
          tags: [] as WpTagListItem[],
        },
        { status: 502 }
      )
    }

    const rows = (await res.json()) as WpTagListItem[]
    const total = res.headers.get('X-WP-Total')
    const totalPages = res.headers.get('X-WP-TotalPages')

    const tags: WpTagListItem[] = Array.isArray(rows)
      ? rows.map(t => ({ ...t, name: decodeHtmlEntities(String(t.name ?? '')) }))
      : []

    return NextResponse.json({
      tags,
      total: total ? parseInt(total, 10) : undefined,
      totalPages: totalPages ? parseInt(totalPages, 10) : undefined,
    })
  } catch (e) {
    console.error('[wp/tags] fetch error', e)
    return NextResponse.json(
      { error: 'WordPress タグ一覧の取得中にエラーが発生しました', tags: [] as WpTagListItem[] },
      { status: 500 }
    )
  }
}
