'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import { requireStaffContext } from '@/lib/salon'

function parseDuration(value: FormDataEntryValue | null): number | null {
  const minutes = Number(String(value ?? '').trim())
  if (!Number.isInteger(minutes) || minutes <= 0) return null
  return minutes
}

export async function createService(formData: FormData) {
  const { salon } = await requireStaffContext()
  const name = String(formData.get('name') ?? '').trim()
  const duration = parseDuration(formData.get('default_duration_min'))
  if (!name || duration === null) return

  const supabase = await createServerSupabase()
  await supabase.from('services').insert({
    salon_id: salon.id,
    name,
    default_duration_min: duration,
  })

  revalidatePath('/setup/services')
  revalidatePath('/board')
}

export async function updateService(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const duration = parseDuration(formData.get('default_duration_min'))
  if (!id || !name || duration === null) return

  const supabase = await createServerSupabase()
  await supabase.from('services').update({ name, default_duration_min: duration }).eq('id', id)

  revalidatePath('/setup/services')
  revalidatePath('/board')
}

export async function setServiceActive(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const isActive = String(formData.get('is_active') ?? '') === 'true'
  if (!id) return

  const supabase = await createServerSupabase()
  await supabase.from('services').update({ is_active: isActive }).eq('id', id)

  revalidatePath('/setup/services')
  revalidatePath('/board')
}
