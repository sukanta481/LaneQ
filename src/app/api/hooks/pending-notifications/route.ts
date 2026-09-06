import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedHookRequest, unauthorized } from '@/lib/n8n-auth'
import { computeQueue, type Lane } from '@/lib/queue'
import { toDomainVisit } from '@/lib/visit-mapper'
import { salonToday } from '@/lib/day'
import type { LaneRow, VisitRow } from '@/lib/types'

export const dynamic = 'force-dynamic'

const ALMOST_THRESHOLD_MIN = 10

/**
 * Visits whose projected start is within ten minutes and that have not been
 * warned yet.
 *
 * estimatedStartAt is never stored, so this recomputes the queue per salon on
 * every call. It covers every salon in one request — n8n's cron calls it once a
 * minute — and each row carries the salon's webhook URL so the workflow knows
 * where to send.
 */
export async function GET(request: Request) {
  if (!isAuthorizedHookRequest(request)) return unauthorized()

  const supabase = createAdminClient()
  const now = new Date()

  const { data: salons } = await supabase
    .from('salons')
    .select('id, name, timezone, n8n_webhook_url')

  const notifications = []

  for (const salon of salons ?? []) {
    const [{ data: lanes }, { data: visits }] = await Promise.all([
      supabase.from('lanes').select('*').eq('salon_id', salon.id),
      supabase
        .from('visits')
        .select('*')
        .eq('salon_id', salon.id)
        .eq('service_date', salonToday(salon.timezone, now))
        .in('status', ['waiting', 'in_service']),
    ])

    const rows = (visits ?? []) as VisitRow[]
    const domainLanes: Lane[] = ((lanes ?? []) as LaneRow[]).map((lane) => ({
      id: lane.id,
      name: lane.name,
      sortOrder: lane.sort_order,
      isActive: lane.is_active,
    }))

    const entries = computeQueue(rows.map(toDomainVisit), domainLanes, now)
    const byId = new Map(rows.map((row) => [row.id, row]))

    for (const entry of entries) {
      if (entry.position === 0 || entry.estimatedStartAt === null) continue

      const minutesAway = (entry.estimatedStartAt.getTime() - now.getTime()) / 60_000
      if (minutesAway > ALMOST_THRESHOLD_MIN) continue

      const visit = byId.get(entry.visitId)
      if (!visit || visit.notified_almost_at !== null || !visit.phone) continue

      notifications.push({
        salon_id: salon.id,
        salon_name: salon.name,
        n8n_webhook_url: salon.n8n_webhook_url,
        visit_id: visit.id,
        customer_name: visit.customer_name,
        phone: visit.phone,
        position: entry.position,
        estimated_wait_min: entry.estimatedWaitMin,
        tracking_url: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/t/${visit.tracking_token}`,
      })
    }
  }

  return Response.json({ notifications })
}
