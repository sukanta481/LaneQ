import { timingSafeEqual } from 'node:crypto'

/**
 * Shared-secret guard for the n8n hook routes. Compared in constant time so the
 * endpoint does not leak the secret one byte at a time under timing analysis.
 */
export function isAuthorizedHookRequest(request: Request): boolean {
  const secret = process.env.N8N_API_SECRET
  if (!secret) return false

  const provided = Buffer.from(request.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)

  if (provided.length !== expected.length) return false
  return timingSafeEqual(provided, expected)
}

export function unauthorized(): Response {
  return Response.json({ error: 'unauthorized' }, { status: 401 })
}
