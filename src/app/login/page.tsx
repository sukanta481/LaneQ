import { LoginForm } from './login-form'

export default async function LoginPage(props: PageProps<'/login'>) {
  const params = await props.searchParams
  const next = typeof params.next === 'string' ? params.next : '/board'

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">LaneQ</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to your front desk.</p>
        <LoginForm next={next} />
      </div>
    </main>
  )
}
