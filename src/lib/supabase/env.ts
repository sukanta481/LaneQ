/**
 * Supabase renamed its API keys: the anon key became the *publishable* key and
 * the service-role key became the *secret* key. Projects created before the
 * change still issue the old names, and the dashboard's connect snippet now
 * shows the new ones, so both are accepted.
 *
 * Each name is read as a full literal `process.env.X` expression — that is what
 * lets Next inline the NEXT_PUBLIC_ values into the client bundle at build time.
 */

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  ''

/** Server-only. Bypasses RLS, so it must never reach the browser. */
export const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  ''

/** Fail loudly at the call site rather than sending "undefined" to Supabase. */
export function requirePublicEnv(): { url: string; key: string } {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      'Missing Supabase config. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local',
    )
  }
  return { url: SUPABASE_URL, key: SUPABASE_PUBLISHABLE_KEY }
}

export function requireSecretEnv(): { url: string; key: string } {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw new Error(
      'Missing Supabase secret key. Set SUPABASE_SECRET_KEY in .env.local (server-side only).',
    )
  }
  return { url: SUPABASE_URL, key: SUPABASE_SECRET_KEY }
}
