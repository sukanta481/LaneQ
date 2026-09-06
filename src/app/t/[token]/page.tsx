import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeQueue, type Lane, type Visit } from '@/lib/queue'
import { salonToday } from '@/lib/day'
import type { Salon } from '@/lib/types'
import { AutoRefresh } from './auto-refresh'

export const dynamic = 'force-dynamic'

const CLOSED = ['done', 'walked_out', 'no_show']

/**
 * Public, unauthenticated, read by tracking_token only.
 *
 * The service role bypasses RLS, so every query here is projected down to the
 * columns this page actually needs. The queue it computes covers the whole
 * salon, and no other customer's name or phone is ever loaded.
 */
export default async function TrackingPage(props: PageProps<'/t/[token]'>) {
  const { token } = await props.params
  const supabase = createAdminClient()

  const { data: visit } = await supabase
    .from('visits')
    .select(
      'id, salon_id, customer_name, status, duration_min, requested_lane_id, assigned_lane_id, created_at, started_at, token_number',
    )
    .eq('tracking_token', token)
    .maybeSingle()

  if (!visit || CLOSED.includes(visit.status)) notFound()

  const { data: salonRow } = await supabase
    .from('salons')
    .select('id, name, slug, timezone, terminology, branding, n8n_webhook_url')
    .eq('id', visit.salon_id)
    .single()

  if (!salonRow) notFound()
  const salon = salonRow as Salon

  const [{ data: lanes }, { data: openVisits }] = await Promise.all([
    supabase.from('lanes').select('id, name, sort_order, is_active').eq('salon_id', salon.id),
    supabase
      .from('visits')
      // Deliberately no customer_name, no phone: this page must never hold
      // another customer's details in memory, let alone serialise them.
      .select('id, duration_min, requested_lane_id, assigned_lane_id, status, created_at, started_at')
      .eq('salon_id', salon.id)
      .eq('service_date', salonToday(salon.timezone))
      .in('status', ['waiting', 'in_service']),
  ])

  const domainVisits: Visit[] = (openVisits ?? []).map((row) => ({
    id: row.id,
    durationMin: row.duration_min,
    requestedLaneId: row.requested_lane_id,
    assignedLaneId: row.assigned_lane_id,
    status: row.status,
    createdAt: new Date(row.created_at),
    startedAt: row.started_at === null ? null : new Date(row.started_at),
  }))

  const domainLanes: Lane[] = (lanes ?? []).map((lane) => ({
    id: lane.id,
    name: lane.name,
    sortOrder: lane.sort_order,
    isActive: lane.is_active,
  }))

  const entry = computeQueue(domainVisits, domainLanes, new Date()).find((e) => e.visitId === visit.id)

  const firstName = visit.customer_name.trim().split(/\s+/)[0]
  const laneSingular = salon.terminology.lane_singular

  // Only ever name a lane the customer is actually going to. A projected lane
  // for an "any lane" visit reshuffles on every change, so promising it would
  // be a promise the salon cannot keep.
  const committedLaneId = visit.assigned_lane_id ?? visit.requested_lane_id
  const laneName = committedLaneId
    ? (domainLanes.find((lane) => lane.id === committedLaneId)?.name ?? null)
    : null

  const inService = visit.status === 'in_service'

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-slate-100 p-6">
      <AutoRefresh seconds={30} />

      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-slate-500">{salon.name}</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Hi {firstName}</h1>

        {inService ? (
          <p className="mt-6 text-lg font-medium text-teal-700">
            You&rsquo;re in the {laneSingular.toLowerCase()} now.
          </p>
        ) : (
          <>
            <p className="mt-6 text-5xl font-semibold tabular-nums text-slate-900">
              {entry?.estimatedWaitMin ?? '—'}
              <span className="ml-1 text-lg font-normal text-slate-500">min</span>
            </p>
            <p className="mt-1 text-sm text-slate-500">estimated wait</p>

            {entry?.position ? (
              <p className="mt-4 text-base text-slate-700">
                You are number {entry.position} in line
              </p>
            ) : null}
          </>
        )}

        {laneName ? (
          <p className="mt-2 text-sm text-slate-500">
            {laneSingular}: {laneName}
          </p>
        ) : null}

        <p className="mt-6 border-t border-slate-100 pt-4 text-sm text-slate-500">
          We&rsquo;ll message you when it&rsquo;s nearly your turn. This page updates on its own.
        </p>

        <p className="mt-3 text-xs text-slate-400">Token #{visit.token_number}</p>
      </div>
    </main>
  )
}
