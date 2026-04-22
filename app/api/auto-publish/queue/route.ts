/**
 * 自動投稿キューの CRUD。
 * GET    : 現在のキュー一覧を返す
 * POST   : { promptId, keyword, wordpressTags?, wordpressCategoryIds? } を追加
 * DELETE : { id } で指定アイテムを削除
 *
 * 認証：ログイン済み管理者のみ利用可。Next.js アプリ内の既存 auth-edge の session cookie をチェックする
 * ほど厳密にせず、簡易ガードとして CRON_SECRET ヘッダでも通す（UI からは fetch で Cookie 認証、
 * スクリプトからは Bearer で叩ける）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  getAutoRunQueue,
  enqueueAutoRun,
  removeAutoRunItem,
} from '@/lib/autoRunQueue'
import { verifyAuthCookieEdge, getAuthCookieName } from '@/lib/auth-edge'

export const dynamic = 'force-dynamic'

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET?.trim()
  const header = request.headers.get('authorization') ?? ''
  if (cronSecret && header === `Bearer ${cronSecret}`) return true

  const token = cookies().get(getAuthCookieName())?.value
  if (!token) return false
  const secret = process.env.AUTH_SECRET?.trim() ?? ''
  try {
    return await verifyAuthCookieEdge(token, secret)
  } catch {
    return false
  }
}

export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const items = await getAutoRunQueue()
  return NextResponse.json({ items })
}

export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const body = await request.json()
    const promptId = typeof body?.promptId === 'string' ? body.promptId.trim() : ''
    const keyword = typeof body?.keyword === 'string' ? body.keyword.trim() : ''
    if (!promptId || !keyword) {
      return NextResponse.json(
        { error: 'promptId と keyword は必須です' },
        { status: 400 },
      )
    }
    const wordpressTags = Array.isArray(body?.wordpressTags)
      ? body.wordpressTags.filter((t: unknown): t is string => typeof t === 'string' && !!t.trim())
      : undefined
    const wordpressCategoryIds = Array.isArray(body?.wordpressCategoryIds)
      ? body.wordpressCategoryIds.filter((n: unknown): n is number => typeof n === 'number')
      : undefined

    const added = await enqueueAutoRun({
      promptId,
      keyword,
      ...(wordpressTags && wordpressTags.length > 0 ? { wordpressTags } : {}),
      ...(wordpressCategoryIds && wordpressCategoryIds.length > 0 ? { wordpressCategoryIds } : {}),
    })
    return NextResponse.json({ item: added })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const body = await request.json()
    const id = typeof body?.id === 'string' ? body.id.trim() : ''
    if (!id) {
      return NextResponse.json({ error: 'id は必須です' }, { status: 400 })
    }
    const ok = await removeAutoRunItem(id)
    return NextResponse.json({ removed: ok })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
