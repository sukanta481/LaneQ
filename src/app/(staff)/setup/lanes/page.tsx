import { createServerSupabase } from '@/lib/supabase/server'
import { requireStaffContext } from '@/lib/salon'
import type { LaneRow } from '@/lib/types'
import { SetupTabs } from '../tabs'
import { createLane, renameLane, setLaneActive } from './actions'

export default async function LanesPage() {
  const { salon } = await requireStaffContext()
  const supabase = await createServerSupabase()

  const { data } = await supabase.from('lanes').select('*').order('sort_order')
  const lanes = (data ?? []) as LaneRow[]
  const { lane_plural: lanePlural, lane_singular: laneSingular } = salon.terminology

  return (
    <main className="mx-auto w-full max-w-3xl p-4">
      <SetupTabs />

      <h1 className="mt-6 text-xl font-semibold text-slate-900">{lanePlural}</h1>
      <p className="mt-1 text-sm text-slate-500">
        Deactivate a {laneSingular.toLowerCase()} to keep it out of the queue without losing its history.
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {lanes.map((lane) => (
          <li key={lane.id} className="flex items-center gap-2 rounded-xl bg-white p-2 shadow-sm">
            <form action={renameLane} className="flex flex-1 items-center gap-2">
              <input type="hidden" name="id" value={lane.id} />
              <input
                name="name"
                defaultValue={lane.name}
                aria-label={`${laneSingular} name`}
                className="min-h-11 flex-1 rounded-lg border border-transparent px-3 text-base text-slate-900 hover:border-slate-300 focus:border-teal-600 focus:outline-none"
              />
              <button type="submit" className="min-h-11 rounded-lg px-3 text-sm font-medium text-teal-700 hover:bg-teal-50">
                Save
              </button>
            </form>

            <form action={setLaneActive}>
              <input type="hidden" name="id" value={lane.id} />
              <input type="hidden" name="is_active" value={String(!lane.is_active)} />
              <button
                type="submit"
                className={`min-h-11 rounded-lg px-3 text-sm font-medium ${
                  lane.is_active ? 'text-slate-600 hover:bg-slate-100' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {lane.is_active ? 'Deactivate' : 'Inactive — activate'}
              </button>
            </form>
          </li>
        ))}
      </ul>

      <form action={createLane} className="mt-4 flex items-center gap-2 rounded-xl bg-white p-2 shadow-sm">
        <input
          name="name"
          placeholder={`Add a ${laneSingular.toLowerCase()}`}
          required
          className="min-h-11 flex-1 rounded-lg border border-slate-300 px-3 text-base text-slate-900 focus:border-teal-600 focus:outline-none"
        />
        <button type="submit" className="min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white">
          Add
        </button>
      </form>
    </main>
  )
}
