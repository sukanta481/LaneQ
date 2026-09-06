import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedHookRequest, unauthorized } from '@/lib/n8n-auth'

export const dynamic = 'force-dynamic'

/**
 * Records that a message went out. These columns, not n8n's own state, are what
 * stop a customer being messaged twice.
 */
export async function POST(request: Request) {
  if (!isAuthorizedHookRequest(request)) return unauthorized()

  let body: { visit_id?: string; kind?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 })
  }

  const visitId = body.visit_id
  const kind = body.kind

  if (!visitId || (kind !== 'almost' && kind !== 'created')) {
    return Response.json({ error: 'visit_id and kind ("almost" | "created") are required' }, { status: 400 })
  }

  const column = kind === 'almost' ? 'notified_almost_at' : 'notified_created_at'

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('visits')
    .update({ [column]: new Date().toISOString() })
    .eq('id', visitId)
    .is(column, null)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
