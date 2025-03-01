import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  const {
    data: { session },
  } = await supabase.auth.getSession()

  // If there's no session and the user is trying to access a protected route
  if (!session && req.nextUrl.pathname !== '/auth') {
    return NextResponse.redirect(new URL('/auth', req.url))
  }

  // If there's a session and the user is on the auth page
  if (session && req.nextUrl.pathname === '/auth') {
    return NextResponse.redirect(new URL('/calendar', req.url))
  }

  // If accessing the password update page, check for hash fragment
  if (req.nextUrl.pathname === '/auth/update-password') {
    return res
  }

  return res
}

export const config = {
  matcher: [
    '/auth/update-password',
    '/groups/:path*',
    '/calendar/:path*'
  ]
} 