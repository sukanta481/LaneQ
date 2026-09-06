'use client'

import { useState } from 'react'
import type { LaneRow, ServiceRow, Terminology } from '@/lib/types'
import { createWalkIn } from './actions'

/**
 * Four fields, chips instead of dropdowns, primary control in the lower half of
 * the screen. Reception fills this standing up, one-handed, dozens of times a day.
 */
export function WalkInSheet({
  services,
  lanes,
  terminology,
}: {
  services: ServiceRow[]
  lanes: LaneRow[]
  terminology: Terminology
}) {
  const [open, setOpen] = useState(false)
  const [serviceId, setServiceId] = useState<string>(services[0]?.id ?? '')
  const [laneId, setLaneId] = useState<string>('')
  const [saving, setSaving] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 min-h-14 rounded-full bg-teal-700 px-6 text-base font-semibold text-white shadow-lg"
      >
        + Walk-in
      </button>
    )
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-10 rounded-t-2xl bg-white p-4 shadow-[0_-4px_24px_rgba(0,0,0,0.15)]">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">New walk-in</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="min-h-11 rounded-lg px-3 text-sm font-medium text-slate-500"
          >
            Cancel
          </button>
        </div>

        <form
          action={async (formData) => {
            setSaving(true)
            try {
              await createWalkIn(formData)
              setOpen(false)
              setLaneId('')
              setServiceId(services[0]?.id ?? '')
            } finally {
              setSaving(false)
            }
          }}
          className="mt-3 flex flex-col gap-3"
        >
          <input
            name="customer_name"
            placeholder={terminology.customer_singular}
            required
            autoFocus
            autoComplete="off"
            className="min-h-12 rounded-lg border border-slate-300 px-3 text-base text-slate-900 focus:border-teal-600 focus:outline-none"
          />

          <input
            name="phone"
            type="tel"
            inputMode="tel"
            placeholder="Phone"
            autoComplete="off"
            className="min-h-12 rounded-lg border border-slate-300 px-3 text-base text-slate-900 focus:border-teal-600 focus:outline-none"
          />
          <p className="-mt-1 text-xs text-slate-500">
            We message this number about their turn. Ask before adding it.
          </p>

          <input type="hidden" name="service_id" value={serviceId} />
          <ChipRow label={terminology.service_singular}>
            {services.map((service) => (
              <Chip
                key={service.id}
                selected={service.id === serviceId}
                onClick={() => setServiceId(service.id)}
              >
                {service.name}
                <span className="ml-1 text-xs opacity-70">{service.default_duration_min}m</span>
              </Chip>
            ))}
          </ChipRow>

          <input type="hidden" name="requested_lane_id" value={laneId} />
          <ChipRow label={terminology.lane_singular}>
            <Chip selected={laneId === ''} onClick={() => setLaneId('')}>
              Any
            </Chip>
            {lanes.map((lane) => (
              <Chip key={lane.id} selected={lane.id === laneId} onClick={() => setLaneId(lane.id)}>
                {lane.name}
              </Chip>
            ))}
          </ChipRow>

          <button
            type="submit"
            disabled={saving || !serviceId}
            className="min-h-14 rounded-xl bg-teal-700 text-base font-semibold text-white disabled:opacity-50"
          >
            {saving ? 'Adding…' : 'Add to queue'}
          </button>
        </form>
      </div>
    </div>
  )
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1 flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`min-h-11 rounded-full px-4 text-sm font-medium ${
        selected ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700'
      }`}
    >
      {children}
    </button>
  )
}
