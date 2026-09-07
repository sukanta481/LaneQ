import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { requirePublicEnv } from './env'

/**
 * Request-scoped Supabase client. `cookies()` is async in Next 16, and a new
 * client must be created per request — reusing one would leave later responses
 * without the no-store headers that auth cookie writes require.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies()
  const { url, key } = requirePublicEnv()

  return createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Called from a Server Component, where cookies are read-only. The
            // proxy refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  )
}
