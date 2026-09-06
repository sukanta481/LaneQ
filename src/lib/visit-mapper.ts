import type { Visit } from './queue'
import type { VisitRow } from './types'

/** Database rows carry ISO strings; the ETA engine works in Dates. */
export function toDomainVisit(row: VisitRow): Visit {
  return {
    id: row.id,
    durationMin: row.duration_min,
    requestedLaneId: row.requested_lane_id,
    assignedLaneId: row.assigned_lane_id,
    status: row.status,
    createdAt: new Date(row.created_at),
    startedAt: row.started_at === null ? null : new Date(row.started_at),
  }
}
