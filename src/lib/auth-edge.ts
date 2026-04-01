/**
 * Edge Runtime 用の認証Cookie検証（Web Crypto API 使用）
 * middleware で利用
 */

const COOKIE_NAME = 'nas_auth'

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad = base64.length % 4
  const padded = pad ? base64 + '='.repeat(4 - pad) : base64
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function base64UrlEncode(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function hmacSha256(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return base64UrlEncode(sig)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

export async function verifyAuthCookieEdge(
  value: string | undefined,
  secret: string
): Promise<boolean> {
  if (!value || !secret || secret.length < 16) return false
  const i = value.lastIndexOf('.')
  if (i === -1) return false
  const payload = value.slice(0, i)
  const sig = value.slice(i + 1)
  const parts = payload.split('|')
  if (parts[0] !== 'ok' || !parts[1]) return false
  const expiry = Number(parts[1])
  if (Number.isNaN(expiry) || expiry < Date.now()) return false
  const expected = await hmacSha256(secret, payload)
  return timingSafeEqual(expected, sig)
}

export function getAuthCookieName(): string {
  return COOKIE_NAME
}
