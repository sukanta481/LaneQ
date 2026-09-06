'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import { requireStaffContext } from '@/lib/salon'

export async function createLane(formData: FormData) {
  const { salon } = await requireStaffContext()
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return

  const supabase = await createServerSupabase()
  const { data: last } = await supabase
    .from('lanes')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  await supabase.from('lanes').insert({
    salon_id: salon.id,
    name,
    sort_order: (last?.sort_order ?? 0) + 1,
  })

  revalidatePath('/setup/lanes')
  revalidatePath('/board')
}

export async function renameLane(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  if (!id || !name) return

  const supabase = await createServerSupabase()
  await supabase.from('lanes').update({ name }).eq('id', id)

  revalidatePath('/setup/lanes')
  revalidatePath('/board')
}

export async function setLaneActive(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const isActive = String(formData.get('is_active') ?? '') === 'true'
  if (!id) return

  const supabase = await createServerSupabase()
  await supabase.from('lanes').update({ is_active: isActive }).eq('id', id)

  revalidatePath('/setup/lanes')
  revalidatePath('/board')
}
