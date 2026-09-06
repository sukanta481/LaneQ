'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import { requireStaffContext } from '@/lib/salon'
import { computeQueue, type Lane } from '@/lib/queue'
import { toDomainVisit } from '@/lib/visit-mapper'
import { salonToday } from '@/lib/day'
import type { LaneRow, VisitRow } from '@/lib/types'

export async function createWalkIn(formData: FormData) {
  const { salon } = await requireStaffContext()

  const customerName = String(formData.get('customer_name') ?? '').trim()
  const phone = String(formData.get('phone') ?? '').trim()
  const serviceId = String(formData.get('service_id') ?? '')
  const requestedLaneId = String(formData.get('requested_lane_id') ?? '')

  if (!customerName || !serviceId) return

  const supabase = await createServerSupabase()

  const { data: service } = await supabase
    .from('services')
    .select('default_duration_min')
    .eq('id', serviceId)
    .single()
  if (!service) return

  const { data: visit } = await supabase
    .from('visits')
    .insert({
      salon_id: salon.id,
      customer_name: customerName,
      phone: phone || null,
      service_id: serviceId,
      duration_min: service.default_duration_min,
      requested_lane_id: requestedLaneId || null,
    })
    .select('*')
    .single<VisitRow>()

  revalidatePath('/board')
  if (!visit) return

  // The webhook must never be able to fail the walk-in, and an un-awaited fetch
  // is killed when a serverless invocation freezes — `after` is what actually
  // keeps it alive past the response.
  const webhookUrl = salon.n8n_webhook_url
  if (!webhookUrl) return

  const [{ data: lanes }, { data: openVisits }] = await Promise.all([
    supabase.from('lanes').select('*').order('sort_order'),
    supabase
      .from('visits')
      .select('*')
      .eq('service_date', salonToday(salon.timezone))
      .in('status', ['waiting', 'in_service']),
  ])

  const entries = computeQueue(
    ((openVisits ?? []) as VisitRow[]).map(toDomainVisit),
    ((lanes ?? []) as LaneRow[]).map(
      (lane): Lane => ({
        id: lane.id,
        name: lane.name,
        sortOrder: lane.sort_order,
        isActive: lane.is_active,
      }),
    ),
    new Date(),
  )
  const entry = entries.find((candidate) => candidate.visitId === visit.id)

  const payload = {
    event: 'visit_created',
    salon_id: salon.id,
    visit_id: visit.id,
    customer_name: visit.customer_name,
    phone: visit.phone,
    position: entry?.position ?? null,
    estimated_wait_min: entry?.estimatedWaitMin ?? null,
    tracking_url: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/t/${visit.tracking_token}`,
  }

  after(async () => {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch (error) {
      console.error('visit_created webhook failed', { visit_id: visit.id, error })
    }
  })
}

export async function startVisit(formData: FormData) {
  await requireStaffContext()
  const id = String(formData.get('id') ?? '')
  const laneId = String(formData.get('lane_id') ?? '')
  if (!id || !laneId) return

  const supabase = await createServerSupabase()
  await supabase
    .from('visits')
    .update({ status: 'in_service', assigned_lane_id: laneId, started_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'waiting')

  revalidatePath('/board')
}

export async function completeVisit(formData: FormData) {
  await requireStaffContext()
  const id = String(formData.get('id') ?? '')
  if (!id) return

  const supabase = await createServerSupabase()
  await supabase
    .from('visits')
    .update({ status: 'done', ended_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'in_service')

  revalidatePath('/board')
}

/** One tap, no confirmation. The number this produces is the point of the product. */
export async function markWalkedOut(formData: FormData) {
  await requireStaffContext()
  const id = String(formData.get('id') ?? '')
  if (!id) return

  const supabase = await createServerSupabase()
  await supabase
    .from('visits')
    .update({ status: 'walked_out', ended_at: new Date().toISOString() })
    .eq('id', id)
    .in('status', ['waiting', 'in_service'])

  revalidatePath('/board')
}
