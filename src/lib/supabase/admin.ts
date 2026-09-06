import { createClient } from '@supabase/supabase-js'

/**
 * Service-role client. Bypasses RLS entirely, so it is only for the public
 * tracking page (which reads one visit by token) and the n8n hook routes
 * (which are bearer-guarded). Never import this into a Client Component.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
