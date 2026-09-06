import { describe, expect, it } from 'vitest'
import { computeQueue, type Lane, type Visit } from './queue'

const NOW = new Date('2026-03-01T10:00:00.000Z')

function minutes(n: number): Date {
  return new Date(NOW.getTime() + n * 60_000)
}

function lane(id: string, sortOrder: number, isActive = true): Lane {
  return { id, name: id.toUpperCase(), sortOrder, isActive }
}

function waiting(id: string, durationMin: number, arrivedMinAgo: number, requestedLaneId: string | null = null): Visit {
  return {
    id,
    durationMin,
    requestedLaneId,
    assignedLaneId: null,
    status: 'waiting',
    createdAt: minutes(-arrivedMinAgo),
    startedAt: null,
  }
}

function inService(id: string, durationMin: number, startedMinAgo: number, assignedLaneId: string): Visit {
  return {
    id,
    durationMin,
    requestedLaneId: null,
    assignedLaneId,
    status: 'in_service',
    createdAt: minutes(-startedMinAgo - 5),
    startedAt: minutes(-startedMinAgo),
  }
}

/** The waiting entries only, in queue order. */
function queued(entries: ReturnType<typeof computeQueue>) {
  return entries.filter((entry) => entry.position > 0)
}

describe('computeQueue', () => {
  // 1
  it('returns an empty array for an empty queue', () => {
    expect(computeQueue([], [lane('a', 1)], NOW)).toEqual([])
  })

  // 2
  it('gives a zero wait when one customer waits and a lane is free', () => {
    const entries = computeQueue([waiting('v1', 25, 0)], [lane('a', 1)], NOW)

    expect(entries).toHaveLength(1)
    expect(entries[0].position).toBe(1)
    expect(entries[0].laneId).toBe('a')
    expect(entries[0].estimatedWaitMin).toBe(0)
    expect(entries[0].estimatedStartAt).toEqual(NOW)
  })

  // 3
  it('never projects an overrunning lane as free in the past', () => {
    // Started 40 minutes ago on a 25-minute service: 15 minutes over.
    const visits = [inService('v0', 25, 40, 'a'), waiting('v1', 25, 10)]
    const entries = computeQueue(visits, [lane('a', 1)], NOW)
    const next = queued(entries)[0]

    expect(next.estimatedStartAt).toEqual(NOW)
    expect(next.estimatedWaitMin).toBe(0)
    expect(next.estimatedStartAt!.getTime()).toBeGreaterThanOrEqual(NOW.getTime())
  })

  // 4
  it('projects the third of three waiting customers behind the earlier of two lanes', () => {
    const visits = [waiting('v1', 30, 3), waiting('v2', 20, 2), waiting('v3', 15, 1)]
    const entries = queued(computeQueue(visits, [lane('a', 1), lane('b', 2)], NOW))

    expect(entries.map((e) => e.visitId)).toEqual(['v1', 'v2', 'v3'])
    expect(entries[0].laneId).toBe('a')
    expect(entries[1].laneId).toBe('b')
    // b frees at +20, a at +30, so v3 takes b.
    expect(entries[2].laneId).toBe('b')
    expect(entries[2].estimatedWaitMin).toBe(20)
  })

  // 5
  it('makes a requested-lane visit wait for that lane even when another is free', () => {
    const visits = [inService('v0', 60, 0, 'a'), waiting('v1', 25, 1, 'a')]
    const entries = queued(computeQueue(visits, [lane('a', 1), lane('b', 2)], NOW))

    expect(entries[0].laneId).toBe('a')
    expect(entries[0].estimatedWaitMin).toBe(60)
    expect(entries[0].requestedLaneUnavailable).toBe(false)
  })

  // 6
  it('interleaves requested-lane and any-lane visits by arrival order', () => {
    const visits = [
      waiting('v1', 30, 3, 'a'), // wants a
      waiting('v2', 30, 2), // any
      waiting('v3', 30, 1, 'a'), // wants a, so queues behind v1
    ]
    const entries = queued(computeQueue(visits, [lane('a', 1), lane('b', 2)], NOW))

    expect(entries.map((e) => e.laneId)).toEqual(['a', 'b', 'a'])
    expect(entries.map((e) => e.estimatedWaitMin)).toEqual([0, 0, 30])
  })

  // 7
  it('never assigns an inactive lane', () => {
    const visits = [waiting('v1', 25, 2), waiting('v2', 25, 1)]
    const lanes = [lane('a', 1, false), lane('b', 2)]
    const entries = queued(computeQueue(visits, lanes, NOW))

    expect(entries.every((e) => e.laneId === 'b')).toBe(true)
  })

  // 8
  it('breaks a tie between two lanes free at the same instant by sort_order', () => {
    const entries = queued(computeQueue([waiting('v1', 25, 0)], [lane('b', 2), lane('a', 1)], NOW))
    expect(entries[0].laneId).toBe('a')

    // Same lanes, reversed input order: same answer.
    const reversed = queued(computeQueue([waiting('v1', 25, 0)], [lane('a', 1), lane('b', 2)], NOW))
    expect(reversed[0].laneId).toBe('a')
  })

  // 9
  it('ignores done, walked_out and no_show visits entirely', () => {
    const finished: Visit[] = (['done', 'walked_out', 'no_show'] as const).map((status, i) => ({
      id: `x${i}`,
      durationMin: 90,
      requestedLaneId: null,
      assignedLaneId: 'a',
      status,
      createdAt: minutes(-30),
      startedAt: minutes(-25),
    }))
    const entries = computeQueue([...finished, waiting('v1', 25, 1)], [lane('a', 1)], NOW)

    expect(entries).toHaveLength(1)
    expect(entries[0].visitId).toBe('v1')
    expect(entries[0].estimatedWaitMin).toBe(0)
  })

  // 10
  it('is deterministic — same input, same output, regardless of input order', () => {
    const lanes = [lane('a', 1), lane('b', 2), lane('c', 3)]
    const visits = [
      inService('v0', 45, 10, 'b'),
      waiting('v1', 30, 5, 'b'),
      waiting('v2', 20, 4),
      waiting('v3', 15, 3),
      waiting('v4', 60, 2),
    ]

    const first = computeQueue(visits, lanes, NOW)
    const again = computeQueue(visits, lanes, NOW)
    const shuffled = computeQueue([...visits].reverse(), [...lanes].reverse(), NOW)

    expect(again).toEqual(first)
    expect(shuffled).toEqual(first)
  })

  // Beyond the ten: cases the spec left undefined.

  it('falls back to any active lane when the requested lane has been deactivated', () => {
    const visits = [waiting('v1', 25, 1, 'a')]
    const lanes = [lane('a', 1, false), lane('b', 2)]
    const entries = queued(computeQueue(visits, lanes, NOW))

    expect(entries[0].laneId).toBe('b')
    expect(entries[0].requestedLaneUnavailable).toBe(true)
    expect(entries[0].estimatedWaitMin).toBe(0)
  })

  it('keeps waiting visits in the queue when every lane is inactive', () => {
    const entries = queued(computeQueue([waiting('v1', 25, 1)], [lane('a', 1, false)], NOW))

    expect(entries).toHaveLength(1)
    expect(entries[0].position).toBe(1)
    expect(entries[0].laneId).toBeNull()
    expect(entries[0].estimatedStartAt).toBeNull()
    expect(entries[0].estimatedWaitMin).toBeNull()
  })

  it('returns in-service visits at position 0 alongside the waiting queue', () => {
    const visits = [inService('v0', 30, 5, 'a'), waiting('v1', 25, 1)]
    const entries = computeQueue(visits, [lane('a', 1), lane('b', 2)], NOW)

    const active = entries.find((e) => e.visitId === 'v0')
    expect(active?.position).toBe(0)
    expect(active?.laneId).toBe('a')
    expect(queued(entries)[0].position).toBe(1)
  })

  it('does not let an in-service visit on a deactivated lane block the queue', () => {
    const visits = [inService('v0', 60, 0, 'a'), waiting('v1', 25, 1)]
    const lanes = [lane('a', 1, false), lane('b', 2)]
    const entries = computeQueue(visits, lanes, NOW)

    expect(entries.find((e) => e.visitId === 'v0')?.position).toBe(0)
    expect(queued(entries)[0].laneId).toBe('b')
    expect(queued(entries)[0].estimatedWaitMin).toBe(0)
  })

  it('handles a zero-minute service without stalling the lane', () => {
    const visits = [waiting('v1', 0, 2), waiting('v2', 25, 1)]
    const entries = queued(computeQueue(visits, [lane('a', 1)], NOW))

    expect(entries[0].estimatedWaitMin).toBe(0)
    expect(entries[1].estimatedWaitMin).toBe(0)
    expect(entries[1].laneId).toBe('a')
  })

  it('sorts equal arrival times deterministically by id', () => {
    const sameInstant = [waiting('v2', 25, 5), waiting('v1', 25, 5)]
    const entries = queued(computeQueue(sameInstant, [lane('a', 1), lane('b', 2)], NOW))

    expect(entries.map((e) => e.visitId)).toEqual(['v1', 'v2'])
  })
})
