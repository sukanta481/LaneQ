import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { requireStaffContext } from '@/lib/salon'
import { salonTime, salonToday } from '@/lib/day'
import type { LaneRow, VisitRow, VisitStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'

const STATUS_LABELS: Record<VisitStatus, string> = {
  waiting: 'Waiting',
  in_service: 'In service',
  done: 'Done',
  walked_out: 'Walked out',
  no_show: 'No show',
}

const FILTERS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'in_service', label: 'In service' },
  { value: 'done', label: 'Done' },
  { value: 'walked_out', label: 'Walked out' },
]

export default async function HistoryPage(props: PageProps<'/history'>) {
  const { salon } = await requireStaffContext()
  const params = await props.searchParams
  const filter = typeof params.status === 'string' ? params.status : 'all'

  const supabase = await createServerSupabase()
  const today = salonToday(salon.timezone)

  const [{ data: visits }, { data: lanes }] = await Promise.all([
    supabase.from('visits').select('*').eq('service_date', today).order('created_at', { ascending: false }),
    supabase.from('lanes').select('*'),
  ])

  const rows = (visits ?? []) as VisitRow[]
  const laneNames = new Map(((lanes ?? []) as LaneRow[]).map((lane) => [lane.id, lane.name]))

  const shown = filter === 'all' ? rows : rows.filter((row) => row.status === filter)

  const served = rows.filter((row) => row.status === 'done')
  const walkedOut = rows.filter((row) => row.status === 'walked_out')
  const waits = served
    .filter((row) => row.started_at !== null)
    .map((row) => (new Date(row.started_at as string).getTime() - new Date(row.created_at).getTime()) / 60_000)
  const averageWait = waits.length === 0 ? null : Math.round(waits.reduce((a, b) => a + b, 0) / waits.length)

  return (
    <main className="mx-auto w-full max-w-5xl p-4">
      <h1 className="text-xl font-semibold text-slate-900">Today</h1>
      <p className="mt-1 text-sm text-slate-500">{today}</p>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Walk-ins" value={rows.length} />
        <Stat label="Served" value={served.length} />
        <Stat label="Walked out" value={walkedOut.length} tone={walkedOut.length > 0 ? 'warn' : 'plain'} />
        <Stat label="Average wait" value={averageWait === null ? '—' : `${averageWait} min`} />
      </dl>

      <nav className="mt-5 flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <Link
            key={option.value}
            href={option.value === 'all' ? '/history' : `/history?status=${option.value}`}
            className={`min-h-11 rounded-lg px-4 py-2.5 text-sm font-medium ${
              filter === option.value ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      <div className="mt-4 overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-3 font-medium">#</th>
              <th className="px-3 py-3 font-medium">{salon.terminology.customer_singular}</th>
              <th className="px-3 py-3 font-medium">Arrived</th>
              <th className="px-3 py-3 font-medium">Started</th>
              <th className="px-3 py-3 font-medium">{salon.terminology.lane_singular}</th>
              <th className="px-3 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.id} className="border-b border-slate-50 last:border-0">
                <td className="px-3 py-3 text-slate-400 tabular-nums">{row.token_number}</td>
                <td className="px-3 py-3 font-medium text-slate-900">{row.customer_name}</td>
                <td className="px-3 py-3 text-slate-600 tabular-nums">{salonTime(salon.timezone, row.created_at)}</td>
                <td className="px-3 py-3 text-slate-600 tabular-nums">
                  {row.started_at ? salonTime(salon.timezone, row.started_at) : '—'}
                </td>
                <td className="px-3 py-3 text-slate-600">
                  {row.assigned_lane_id ? (laneNames.get(row.assigned_lane_id) ?? '—') : '—'}
                </td>
                <td className="px-3 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      row.status === 'walked_out'
                        ? 'bg-amber-100 text-amber-900'
                        : row.status === 'done'
                          ? 'bg-slate-100 text-slate-700'
                          : 'bg-teal-50 text-teal-800'
                    }`}
                  >
                    {STATUS_LABELS[row.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {shown.length === 0 ? <p className="px-3 py-6 text-sm text-slate-400">Nothing to show.</p> : null}
      </div>
    </main>
  )
}

function Stat({
  label,
  value,
  tone = 'plain',
}: {
  label: string
  value: string | number
  tone?: 'plain' | 'warn'
}) {
  return (
    <div className={`rounded-xl p-3 shadow-sm ${tone === 'warn' ? 'bg-amber-50' : 'bg-white'}`}>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</dd>
    </div>
  )
}
