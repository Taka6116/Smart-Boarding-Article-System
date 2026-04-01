import { createHmac, timingSafeEqual } from 'crypto'

const COOKIE_NAME = 'nas_auth'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7日

function getSecret(): string {
  const s = process.env.AUTH_SECRET
  if (!s || s.length < 16) throw new Error('AUTH_SECRET を16文字以上で設定してください')
  return s
}

function sign(payload: string): string {
  const secret = getSecret()
  const hmac = createHmac('sha256', secret)
  hmac.update(payload)
  return payload + '.' + hmac.digest('base64url')
}

function verify(value: string): boolean {
  try {
    const secret = getSecret()
    const i = value.lastIndexOf('.')
    if (i === -1) return false
    const payload = value.slice(0, i)
    const sig = value.slice(i + 1)
    const expected = createHmac('sha256', secret).update(payload).digest('base64url')
    if (expected.length !== sig.length) return false
    return timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
  } catch {
    return false
  }
}

export function createAuthCookie(): string {
  const expiry = Date.now() + COOKIE_MAX_AGE * 1000
  const payload = `ok|${expiry}`
  return sign(payload)
}

export function verifyAuthCookie(value: string | undefined): boolean {
  if (!value) return false
  const [payload] = value.split('.')
  const parts = payload?.split('|')
  if (parts?.[0] !== 'ok' || !parts?.[1]) return false
  const expiry = Number(parts[1])
  if (Number.isNaN(expiry) || expiry < Date.now()) return false
  return verify(value)
}

export function getAuthCookieName(): string {
  return COOKIE_NAME
}
