import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedHookRequest, unauthorized } from '@/lib/n8n-auth'
import { salonToday } from '@/lib/day'
import type { VisitRow } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** Today's counts for the owner's evening message. */
export async function GET(request: Request) {
  if (!isAuthorizedHookRequest(request)) return unauthorized()

  const salonId = new URL(request.url).searchParams.get('salon_id')
  if (!salonId) return Response.json({ error: 'salon_id is required' }, { status: 400 })

  const supabase = createAdminClient()

  const { data: salon } = await supabase
    .from('salons')
    .select('id, name, timezone')
    .eq('id', salonId)
    .maybeSingle()

  if (!salon) return Response.json({ error: 'unknown salon' }, { status: 404 })

  const day = salonToday(salon.timezone)

  const [{ data: visits }, { data: lanes }] = await Promise.all([
    supabase.from('visits').select('*').eq('salon_id', salon.id).eq('service_date', day),
    supabase.from('lanes').select('id, name').eq('salon_id', salon.id),
  ])

  const rows = (visits ?? []) as VisitRow[]
  const laneNames = new Map((lanes ?? []).map((lane) => [lane.id, lane.name]))

  const served = rows.filter((row) => row.status === 'done')
  const walkedOut = rows.filter((row) => row.status === 'walked_out')

  const waits = served
    .filter((row) => row.started_at !== null)
    .map((row) => (new Date(row.started_at as string).getTime() - new Date(row.created_at).getTime()) / 60_000)

  const perLane = new Map<string, number>()
  for (const row of served) {
    if (!row.assigned_lane_id) continue
    perLane.set(row.assigned_lane_id, (perLane.get(row.assigned_lane_id) ?? 0) + 1)
  }

  let busiestLane: { name: string; served: number } | null = null
  for (const [laneId, count] of perLane) {
    if (busiestLane === null || count > busiestLane.served) {
      busiestLane = { name: laneNames.get(laneId) ?? 'Unknown', served: count }
    }
  }

  return Response.json({
    salon_id: salon.id,
    salon_name: salon.name,
    date: day,
    walk_ins: rows.length,
    served: served.length,
    walked_out: walkedOut.length,
    average_wait_min: waits.length === 0 ? null : Math.round(waits.reduce((a, b) => a + b, 0) / waits.length),
    busiest_lane: busiestLane,
  })
}
