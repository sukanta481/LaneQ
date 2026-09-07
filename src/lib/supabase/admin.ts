import { createClient } from '@supabase/supabase-js'
import { requireSecretEnv } from './env'

/**
 * Service-role client. Bypasses RLS entirely, so it is only for the public
 * tracking page (which reads one visit by token) and the n8n hook routes
 * (which are bearer-guarded). Never import this into a Client Component.
 */
export function createAdminClient() {
  const { url, key } = requireSecretEnv()
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
