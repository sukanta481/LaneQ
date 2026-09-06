/**
 * The ETA engine.
 *
 * One pure function. No imports, no I/O, no `Date.now()` — `now` is always
 * passed in, so the same inputs always produce the same output and the whole
 * thing is testable without a database or a clock.
 */

export type Lane = {
  id: string
  name: string
  /** Lower sorts first. Also the deterministic tie-break when two lanes free up together. */
  sortOrder: number
  isActive: boolean
}

export type VisitStatus = 'waiting' | 'in_service' | 'done' | 'walked_out' | 'no_show'

export type Visit = {
  id: string
  durationMin: number
  requestedLaneId: string | null
  assignedLaneId: string | null
  status: VisitStatus
  createdAt: Date
  startedAt: Date | null
}

export type QueueEntry = {
  visitId: string
  /** 0 for a visit already in service; otherwise 1-based across the whole salon. */
  position: number
  /** The projected lane, or null when the salon has no active lane to project onto. */
  laneId: string | null
  estimatedStartAt: Date | null
  estimatedWaitMin: number | null
  /**
   * True when the visit asked for a specific lane that is no longer active, so
   * it has been projected onto any lane instead. The board surfaces this rather
   * than silently moving the customer.
   */
  requestedLaneUnavailable: boolean
}

const MS_PER_MIN = 60_000

/** Stable ordering: sort_order first, then id, so output never depends on input order. */
function byLaneOrder(a: Lane, b: Lane): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export function computeQueue(visits: Visit[], lanes: Lane[], now: Date): QueueEntry[] {
  const nowMs = now.getTime()

  const activeLanes = lanes.filter((lane) => lane.isActive).sort(byLaneOrder)

  // freeAt[laneId] = the moment that lane is next available.
  const freeAt = new Map<string, number>()
  for (const lane of activeLanes) freeAt.set(lane.id, nowMs)

  const entries: QueueEntry[] = []

  // Visits already in service occupy their lane until they finish. A visit that
  // has overrun its estimate frees its lane at `now`, never at a past time.
  const laneRank = new Map<string, number>()
  activeLanes.forEach((lane, i) => laneRank.set(lane.id, i))

  const inService = visits
    .filter((visit) => visit.status === 'in_service')
    .sort((a, b) => {
      const ra = laneRank.get(a.assignedLaneId ?? '') ?? Number.MAX_SAFE_INTEGER
      const rb = laneRank.get(b.assignedLaneId ?? '') ?? Number.MAX_SAFE_INTEGER
      if (ra !== rb) return ra - rb
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })

  for (const visit of inService) {
    const endsAtMs =
      visit.startedAt === null
        ? nowMs
        : Math.max(nowMs, visit.startedAt.getTime() + visit.durationMin * MS_PER_MIN)

    // Only lanes still active can be projected onto. An in-service visit on a
    // since-deactivated lane still finishes, it just isn't assignable.
    const laneId = visit.assignedLaneId
    if (laneId !== null && freeAt.has(laneId)) {
      freeAt.set(laneId, Math.max(freeAt.get(laneId) as number, endsAtMs))
    }

    entries.push({
      visitId: visit.id,
      position: 0,
      laneId,
      estimatedStartAt: visit.startedAt,
      estimatedWaitMin: 0,
      requestedLaneUnavailable: false,
    })
  }

  const waiting = visits
    .filter((visit) => visit.status === 'waiting')
    .sort((a, b) => {
      const delta = a.createdAt.getTime() - b.createdAt.getTime()
      if (delta !== 0) return delta
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })

  let position = 0

  for (const visit of waiting) {
    position += 1

    const requestedIsActive = visit.requestedLaneId !== null && freeAt.has(visit.requestedLaneId)
    const requestedLaneUnavailable = visit.requestedLaneId !== null && !requestedIsActive

    // A requested lane that is still active is the only eligible lane. If it has
    // been deactivated the customer falls back to any lane — they are standing in
    // the salon and must not drop out of the queue — and the board flags it.
    const eligible = requestedIsActive
      ? activeLanes.filter((lane) => lane.id === visit.requestedLaneId)
      : activeLanes

    if (eligible.length === 0) {
      entries.push({
        visitId: visit.id,
        position,
        laneId: null,
        estimatedStartAt: null,
        estimatedWaitMin: null,
        requestedLaneUnavailable,
      })
      continue
    }

    // `eligible` is in sort_order, and the comparison is strictly-less-than, so
    // two lanes free at the same instant resolve to the lower sort_order.
    let chosen = eligible[0]
    for (const lane of eligible) {
      if ((freeAt.get(lane.id) as number) < (freeAt.get(chosen.id) as number)) chosen = lane
    }

    const startMs = freeAt.get(chosen.id) as number
    freeAt.set(chosen.id, startMs + visit.durationMin * MS_PER_MIN)

    entries.push({
      visitId: visit.id,
      position,
      laneId: chosen.id,
      estimatedStartAt: new Date(startMs),
      estimatedWaitMin: Math.max(0, Math.round((startMs - nowMs) / MS_PER_MIN)),
      requestedLaneUnavailable,
    })
  }

  return entries
}
