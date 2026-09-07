import { createBrowserClient } from '@supabase/ssr'
import { requirePublicEnv } from './env'

export function createClient() {
  const { url, key } = requirePublicEnv()
  return createBrowserClient(url, key)
}
