import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyAuthCookieEdge, getAuthCookieName } from '@/lib/auth-edge'

const LOGIN_PATH = '/login'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === LOGIN_PATH) {
    const secret = process.env.AUTH_SECRET
    const cookie = request.cookies.get(getAuthCookieName())?.value
    if (secret && cookie) {
      const ok = await verifyAuthCookieEdge(cookie, secret)
      if (ok) return NextResponse.redirect(new URL('/', request.url))
    }
    return NextResponse.next()
  }

  if (
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/auto-publish/') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next()
  }

  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < 16) {
    const loginUrl = new URL(LOGIN_PATH, request.url)
    return NextResponse.redirect(loginUrl)
  }

  const cookie = request.cookies.get(getAuthCookieName())?.value
  const ok = await verifyAuthCookieEdge(cookie, secret)
  if (!ok) {
    const loginUrl = new URL(LOGIN_PATH, request.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
