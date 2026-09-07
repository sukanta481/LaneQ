import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { requirePublicEnv } from './lib/supabase/env'

/**
 * Next 16 renamed middleware to proxy. Runs on the Node runtime; the edge
 * runtime is not supported here.
 *
 * This refreshes the Supabase session cookie and does an optimistic redirect
 * for logged-out visitors. It is not the authorization boundary — RLS is.
 */
const PUBLIC_PREFIXES = ['/login', '/t/', '/api/hooks/', '/supabase-check']

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request })

  const { url: supabaseUrl, key: supabaseKey } = requirePublicEnv()

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value)
          }
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/board'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
