import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const AUTH_PATH = '/auth'
const DEFAULT_SIGNED_IN_REDIRECT = '/calendar'
const PUBLIC_PATHS = new Set<string>([
  AUTH_PATH,
  '/auth/update-password',
  '/update-password',
])

function isSafeNextPath(value: string | null): value is string {
  return Boolean(value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/api/'))
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  const pathname = req.nextUrl.pathname
  const isApiRequest = pathname.startsWith('/api/')

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session && !PUBLIC_PATHS.has(pathname)) {
    if (isApiRequest) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const authUrl = new URL(AUTH_PATH, req.url)
    authUrl.searchParams.set('next', `${pathname}${req.nextUrl.search}`)
    return NextResponse.redirect(authUrl)
  }

  if (session && pathname === AUTH_PATH) {
    const requestedNext = req.nextUrl.searchParams.get('next')
    const safeNextPath = isSafeNextPath(requestedNext)
      ? requestedNext
      : DEFAULT_SIGNED_IN_REDIRECT

    return NextResponse.redirect(new URL(safeNextPath, req.url))
  }

  return res
}

export const config = {
  matcher: [
    '/auth',
    '/auth/update-password',
    '/update-password',
    '/groups/:path*',
    '/calendar/:path*',
    '/grocery-list/:path*',
    '/meals/:path*',
    '/staples/:path*',
    '/profile/:path*',
    '/api/recipe-import/:path*',
    '/api/groups/invitations/:path*',
  ]
}
