import { NextRequest, NextResponse } from 'next/server'
import { createAuthCookie, getAuthCookieName } from '@/lib/auth'

interface AuthAccount {
  email: string
  password: string
}

function decodeB64(b64: string): string {
  try { return Buffer.from(b64, 'base64').toString('utf8') } catch { return '' }
}

/**
 * 環境変数から認証アカウント一覧を取得（複数アカウント対応）
 * - AUTH_EMAIL / AUTH_PASSWORD (AUTH_PASSWORD_B64) : プライマリ
 * - AUTH_EMAIL_2 / AUTH_PASSWORD_2 (AUTH_PASSWORD_B64_2) : 追加アカウント2
 * - AUTH_EMAIL_3 / AUTH_PASSWORD_3 ...  以降同様（最大10）
 */
function getAuthAccounts(): AuthAccount[] {
  const accounts: AuthAccount[] = []
  const suffixes = ['', '_2', '_3', '_4', '_5', '_6', '_7', '_8', '_9', '_10']
  for (const sfx of suffixes) {
    const email = process.env[`AUTH_EMAIL${sfx}`]?.trim()
    if (!email) continue
    const b64 = process.env[`AUTH_PASSWORD_B64${sfx}`]?.trim()
    const password = b64 ? decodeB64(b64) : (process.env[`AUTH_PASSWORD${sfx}`]?.trim() ?? '')
    if (password) accounts.push({ email, password })
  }
  return accounts
}

export async function POST(request: NextRequest) {
  const accounts = getAuthAccounts()

  if (accounts.length === 0) {
    return NextResponse.json(
      { error: '認証が設定されていません' },
      { status: 500 }
    )
  }

  let body: { email?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'リクエスト形式が不正です' },
      { status: 400 }
    )
  }

  const inputEmail = String(body.email ?? '').trim()
  const inputPassword = String(body.password ?? '').trim()

  const matched = accounts.some(a => a.email === inputEmail && a.password === inputPassword)

  if (!matched) {
    const res: { error: string; debug?: Record<string, number> } = {
      error: 'メールアドレスまたはパスワードが正しくありません',
    }
    if (process.env.NODE_ENV === 'development') {
      res.debug = {
        登録アカウント数: accounts.length,
        入力メール長: inputEmail.length,
        入力PW長: inputPassword.length,
      }
    }
    return NextResponse.json(res, { status: 401 })
  }

  const cookieValue = createAuthCookie()
  const res = NextResponse.json({ ok: true })
  res.cookies.set(getAuthCookieName(), cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7日
  })
  return res
}
