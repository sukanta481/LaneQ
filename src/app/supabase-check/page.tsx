import { cookies } from 'next/headers'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Connection smoke test, in the shape of the Supabase connect snippet.
 *
 * The snippet selects from `todos`, which this schema does not have, so this
 * selects from `salons` instead. It reads with the publishable key through RLS,
 * exactly as a staff page does, so an empty list with no error means the keys
 * are right but you are signed out — which is the correct behaviour.
 */
export default async function Page() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: salons, error } = await supabase.from('salons').select('id, name')

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="text-xl font-semibold text-slate-900">Supabase connection</h1>

      {error ? (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {error.message}
        </p>
      ) : (
        <>
          <p className="mt-4 text-sm text-slate-600">
            Connected. {salons?.length ?? 0} salon(s) visible to this session.
          </p>
          <ul className="mt-2 list-disc pl-5 text-sm text-slate-800">
            {salons?.map((salon) => <li key={salon.id}>{salon.name}</li>)}
          </ul>
          {salons?.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              Zero rows is expected while signed out — RLS is doing its job. Sign in
              at <code>/login</code> and reload to see the salon.
            </p>
          ) : null}
        </>
      )}
    </main>
  )
}
