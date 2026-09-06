import Link from 'next/link'
import { requireStaffContext } from '@/lib/salon'
import { TerminologyProvider } from '@/lib/terminology'
import { signOut } from './actions'

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { salon, staffName } = await requireStaffContext()

  return (
    <TerminologyProvider value={salon.terminology}>
      <div className="flex min-h-dvh flex-col bg-slate-100">
        <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-3">
          <span className="text-lg font-semibold text-slate-900">{salon.name}</span>

          <nav className="flex items-center gap-1 text-sm">
            <Link href="/board" className="min-h-11 rounded-lg px-3 py-2.5 font-medium text-slate-700 hover:bg-slate-100">
              Board
            </Link>
            <Link href="/history" className="min-h-11 rounded-lg px-3 py-2.5 font-medium text-slate-700 hover:bg-slate-100">
              History
            </Link>
            <Link href="/setup/lanes" className="min-h-11 rounded-lg px-3 py-2.5 font-medium text-slate-700 hover:bg-slate-100">
              Setup
            </Link>
          </nav>

          <form action={signOut} className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">{staffName}</span>
            <button type="submit" className="min-h-11 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100">
              Sign out
            </button>
          </form>
        </header>

        <div className="flex-1">{children}</div>
      </div>
    </TerminologyProvider>
  )
}
