import { redirect } from 'next/navigation'
import { createServerSupabase } from './supabase/server'
import type { Salon } from './types'

export type StaffContext = {
  salon: Salon
  staffName: string
  role: 'owner' | 'reception'
}

/**
 * The current staff user's salon. RLS already limits every query to this
 * salon; this is how the UI learns its name, timezone and terminology.
 */
export async function requireStaffContext(): Promise<StaffContext> {
  const supabase = await createServerSupabase()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase
    .from('staff_users')
    .select('name, role, salons (id, name, slug, timezone, terminology, branding, n8n_webhook_url)')
    .eq('auth_user_id', user.id)
    .single()

  if (error || !data?.salons) redirect('/login?error=no_salon')

  return {
    salon: data.salons as unknown as Salon,
    staffName: data.name,
    role: data.role as 'owner' | 'reception',
  }
}
