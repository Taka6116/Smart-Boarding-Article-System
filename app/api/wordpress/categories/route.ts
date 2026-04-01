import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export interface WpCategoryItem {
  id: number
  name: string
  slug: string
  count: number
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

/**
 * GET /api/wordpress/categories
 * WordPress の column__category（カテゴリー（コラム））一覧を取得
 */
export async function GET() {
  const wpUrl = process.env.WORDPRESS_URL?.trim()
  const username = process.env.WORDPRESS_USERNAME?.trim()
  const appPassword = process.env.WORDPRESS_APP_PASSWORD?.trim()

  if (!wpUrl || !username || !appPassword) {
    return NextResponse.json(
      { error: 'WordPress の環境変数が設定されていません', categories: [] },
      { status: 503 },
    )
  }

  const base = wpUrl.replace(/\/+$/, '')
  const url = `${base}/?rest_route=${encodeURIComponent('/wp/v2/column__category')}&per_page=100&orderby=name&order=asc&_fields=id,name,slug,count`

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
      console.error('[wp/categories]', res.status, errText.slice(0, 500))
      return NextResponse.json(
        { error: `カテゴリー一覧の取得に失敗しました (${res.status})`, categories: [] },
        { status: 502 },
      )
    }

    const rows = (await res.json()) as WpCategoryItem[]
    const categories: WpCategoryItem[] = Array.isArray(rows)
      ? rows.map(c => ({ ...c, name: decodeHtmlEntities(String(c.name ?? '')) }))
      : []

    return NextResponse.json({ categories })
  } catch (e) {
    console.error('[wp/categories] fetch error', e)
    return NextResponse.json(
      { error: 'カテゴリー一覧の取得中にエラーが発生しました', categories: [] },
      { status: 500 },
    )
  }
}
