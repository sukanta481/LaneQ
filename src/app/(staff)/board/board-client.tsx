'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { computeQueue, type Lane, type QueueEntry } from '@/lib/queue'
import { toDomainVisit } from '@/lib/visit-mapper'
import { salonTime } from '@/lib/day'
import { useTerminology } from '@/lib/terminology'
import type { LaneRow, ServiceRow, VisitRow } from '@/lib/types'
import { completeVisit, markWalkedOut, startVisit } from './actions'
import { WalkInSheet } from './walk-in-sheet'

const RECOMPUTE_MS = 30_000

export function BoardClient({
  salonId,
  timezone,
  lanes,
  services,
  visits,
  serverNow,
}: {
  salonId: string
  timezone: string
  lanes: LaneRow[]
  services: ServiceRow[]
  visits: VisitRow[]
  serverNow: string
}) {
  const router = useRouter()
  const terminology = useTerminology()

  // Seeded from the server's clock so the first paint matches, then ticks
  // locally so ETAs count down while nothing else changes.
  const [now, setNow] = useState(() => new Date(serverNow))

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), RECOMPUTE_MS)
    return () => clearInterval(timer)
  }, [])

  // Any change to this salon's visits refetches; the recompute is local.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`board:${salonId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'visits', filter: `salon_id=eq.${salonId}` },
        () => router.refresh(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [salonId, router])

  const entries = useMemo(() => {
    const domainLanes: Lane[] = lanes.map((lane) => ({
      id: lane.id,
      name: lane.name,
      sortOrder: lane.sort_order,
      isActive: lane.is_active,
    }))
    return computeQueue(visits.map(toDomainVisit), domainLanes, now)
  }, [visits, lanes, now])

  const entryByVisit = useMemo(() => new Map(entries.map((e) => [e.visitId, e])), [entries])
  const laneById = useMemo(() => new Map(lanes.map((l) => [l.id, l])), [lanes])

  const activeLanes = lanes.filter((lane) => lane.is_active)
  const inService = visits.filter((visit) => visit.status === 'in_service')
  const waiting = visits.filter((visit) => visit.status === 'waiting')

  // The strip is the queue of arrivals who did not ask for a particular lane;
  // the columns are the lanes themselves. Splitting them this way keeps any one
  // customer in exactly one place on screen.
  const pooled = waiting.filter((visit) => visit.requested_lane_id === null)

  return (
    <main className="p-3 pb-28">
      <section aria-labelledby="pool-heading">
        <h2 id="pool-heading" className="px-1 text-sm font-semibold text-slate-600">
          Waiting — any {terminology.lane_singular.toLowerCase()} ({pooled.length})
        </h2>

        {pooled.length === 0 ? (
          <p className="px-1 py-3 text-sm text-slate-400">Nobody waiting.</p>
        ) : (
          <ul className="mt-2 flex gap-2 overflow-x-auto pb-2">
            {pooled.map((visit) => {
              const entry = entryByVisit.get(visit.id)
              return (
                <li key={visit.id} className="min-w-64 shrink-0 rounded-xl bg-white p-3 shadow-sm">
                  <QueuedCard
                    visit={visit}
                    entry={entry}
                    laneName={entry?.laneId ? (laneById.get(entry.laneId)?.name ?? null) : null}
                    laneSingular={terminology.lane_singular}
                  />
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="lanes-heading" className="mt-4">
        <h2 id="lanes-heading" className="sr-only">
          {terminology.lane_plural}
        </h2>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
          {activeLanes.map((lane) => {
            const active = inService.find((visit) => visit.assigned_lane_id === lane.id)
            const requested = waiting.filter((visit) => visit.requested_lane_id === lane.id)

            return (
              <div key={lane.id} className="flex flex-col rounded-xl bg-white p-3 shadow-sm">
                <h3 className="text-base font-semibold text-slate-900">{lane.name}</h3>

                {active ? (
                  <InServiceCard visit={active} now={now} timezone={timezone} />
                ) : (
                  <p className="mt-3 rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-400">
                    Free
                  </p>
                )}

                {requested.length > 0 ? (
                  <ul className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3">
                    {requested.map((visit) => (
                      <li key={visit.id}>
                        <QueuedCard
                          visit={visit}
                          entry={entryByVisit.get(visit.id)}
                          laneName={null}
                          laneSingular={terminology.lane_singular}
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )
          })}
        </div>

        {activeLanes.length === 0 ? (
          <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            No active {terminology.lane_plural.toLowerCase()}. Add one in Setup before starting anyone.
          </p>
        ) : null}
      </section>

      <WalkInSheet services={services} lanes={activeLanes} terminology={terminology} />
    </main>
  )

  function QueuedCard({
    visit,
    entry,
    laneName,
    laneSingular,
  }: {
    visit: VisitRow
    entry: QueueEntry | undefined
    laneName: string | null
    laneSingular: string
  }) {
    const wait = entry?.estimatedWaitMin
    const startLaneId = entry?.laneId ?? null

    return (
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-base font-medium text-slate-900">{visit.customer_name}</span>
          <span className="shrink-0 text-xs text-slate-400">#{visit.token_number}</span>
        </div>

        <p className="mt-0.5 text-sm text-slate-500">
          {entry?.position ? `${ordinal(entry.position)} in line` : 'In line'}
          {wait === null || wait === undefined ? '' : ` · ~${wait} min`}
          {laneName ? ` · ${laneName}` : ''}
        </p>

        {entry?.requestedLaneUnavailable ? (
          <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
            Requested {laneSingular.toLowerCase()} is inactive — projected onto another.
          </p>
        ) : null}

        <div className="mt-2 flex gap-2">
          <form action={startVisit} className="flex-1">
            <input type="hidden" name="id" value={visit.id} />
            <input type="hidden" name="lane_id" value={startLaneId ?? ''} />
            <button
              type="submit"
              disabled={startLaneId === null}
              className="min-h-11 w-full rounded-lg bg-teal-700 px-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              Start
            </button>
          </form>

          <form action={markWalkedOut}>
            <input type="hidden" name="id" value={visit.id} />
            <button
              type="submit"
              className="min-h-11 rounded-lg bg-slate-100 px-3 text-sm font-medium text-slate-700"
            >
              Walked out
            </button>
          </form>
        </div>
      </div>
    )
  }
}

function InServiceCard({ visit, now, timezone }: { visit: VisitRow; now: Date; timezone: string }) {
  const startedAt = visit.started_at ? new Date(visit.started_at) : null
  const dueAt = startedAt ? new Date(startedAt.getTime() + visit.duration_min * 60_000) : null
  const overrunMin = dueAt ? Math.floor((now.getTime() - dueAt.getTime()) / 60_000) : 0

  return (
    <div className="mt-3 rounded-lg bg-teal-50 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-base font-medium text-slate-900">{visit.customer_name}</span>
        <span className="shrink-0 text-xs text-slate-400">#{visit.token_number}</span>
      </div>

      <p className="mt-0.5 text-sm text-slate-500">
        {startedAt ? `Started ${salonTime(timezone, startedAt)}` : 'In service'} · {visit.duration_min} min
      </p>

      {overrunMin > 0 ? (
        <p className="mt-1 rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900">
          {overrunMin} min over — everyone behind is waiting on this.
        </p>
      ) : null}

      <div className="mt-2 flex gap-2">
        <form action={completeVisit} className="flex-1">
          <input type="hidden" name="id" value={visit.id} />
          <button type="submit" className="min-h-11 w-full rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white">
            Done
          </button>
        </form>

        <form action={markWalkedOut}>
          <input type="hidden" name="id" value={visit.id} />
          <button type="submit" className="min-h-11 rounded-lg bg-slate-100 px-3 text-sm font-medium text-slate-700">
            Walked out
          </button>
        </form>
      </div>
    </div>
  )
}

function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}
