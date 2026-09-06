import { createServerSupabase } from '@/lib/supabase/server'
import { requireStaffContext } from '@/lib/salon'
import type { ServiceRow } from '@/lib/types'
import { SetupTabs } from '../tabs'
import { createService, setServiceActive, updateService } from './actions'

export default async function ServicesPage() {
  const { salon } = await requireStaffContext()
  const supabase = await createServerSupabase()

  const { data } = await supabase.from('services').select('*').order('name')
  const services = (data ?? []) as ServiceRow[]
  const serviceSingular = salon.terminology.service_singular

  return (
    <main className="mx-auto w-full max-w-3xl p-4">
      <SetupTabs />

      <h1 className="mt-6 text-xl font-semibold text-slate-900">{serviceSingular}s</h1>
      <p className="mt-1 text-sm text-slate-500">
        The default duration is copied onto each visit when it is created, and can be changed per visit.
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {services.map((service) => (
          <li key={service.id} className="flex items-center gap-2 rounded-xl bg-white p-2 shadow-sm">
            <form action={updateService} className="flex flex-1 items-center gap-2">
              <input type="hidden" name="id" value={service.id} />
              <input
                name="name"
                defaultValue={service.name}
                aria-label={`${serviceSingular} name`}
                className="min-h-11 flex-1 rounded-lg border border-transparent px-3 text-base text-slate-900 hover:border-slate-300 focus:border-teal-600 focus:outline-none"
              />
              <input
                name="default_duration_min"
                type="number"
                min={1}
                defaultValue={service.default_duration_min}
                aria-label="Default duration in minutes"
                className="min-h-11 w-24 rounded-lg border border-transparent px-3 text-base text-slate-900 hover:border-slate-300 focus:border-teal-600 focus:outline-none"
              />
              <span className="text-sm text-slate-400">min</span>
              <button type="submit" className="min-h-11 rounded-lg px-3 text-sm font-medium text-teal-700 hover:bg-teal-50">
                Save
              </button>
            </form>

            <form action={setServiceActive}>
              <input type="hidden" name="id" value={service.id} />
              <input type="hidden" name="is_active" value={String(!service.is_active)} />
              <button
                type="submit"
                className={`min-h-11 rounded-lg px-3 text-sm font-medium ${
                  service.is_active ? 'text-slate-600 hover:bg-slate-100' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {service.is_active ? 'Deactivate' : 'Inactive — activate'}
              </button>
            </form>
          </li>
        ))}
      </ul>

      <form action={createService} className="mt-4 flex items-center gap-2 rounded-xl bg-white p-2 shadow-sm">
        <input
          name="name"
          placeholder={`Add a ${serviceSingular.toLowerCase()}`}
          required
          className="min-h-11 flex-1 rounded-lg border border-slate-300 px-3 text-base text-slate-900 focus:border-teal-600 focus:outline-none"
        />
        <input
          name="default_duration_min"
          type="number"
          min={1}
          placeholder="30"
          required
          aria-label="Default duration in minutes"
          className="min-h-11 w-24 rounded-lg border border-slate-300 px-3 text-base text-slate-900 focus:border-teal-600 focus:outline-none"
        />
        <span className="text-sm text-slate-400">min</span>
        <button type="submit" className="min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white">
          Add
        </button>
      </form>
    </main>
  )
}
