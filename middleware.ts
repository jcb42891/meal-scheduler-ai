import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  const {
    data: { session },
  } = await supabase.auth.getSession()

  // Add debug logging
  console.log('Current path:', req.nextUrl.pathname)
  console.log('Session:', session ? 'exists' : 'null')

  // If there's no session and the user is trying to access a protected route
  if (!session && req.nextUrl.pathname !== '/auth') {
    console.log('Redirecting to /auth - no session detected')
    return NextResponse.redirect(new URL('/auth', req.url))
  }

  // If there's a session and the user is on the auth page
  if (session && req.nextUrl.pathname === '/auth') {
    console.log('Redirecting to /calendar - user is authenticated')
    return NextResponse.redirect(new URL('/calendar', req.url))
  }

  return res
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
} 