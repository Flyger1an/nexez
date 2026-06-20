import { NextResponse, type NextRequest } from 'next/server'
import { authenticateNexieRequest } from '../../../../lib/agents/nexie-auth'
import { deleteUserAccount } from '../../../../lib/server/delete-account'
import { enforceRateLimit } from '../../../../lib/rate-limit'

export const maxDuration = 30

/**
 * POST /api/account/delete — permanently delete the authenticated user's account + ALL associated
 * data (App Store Guideline 5.1.1(v) + GDPR/CCPA). The target is ALWAYS the session user (cookie
 * on web, bearer token in the Nexxi app — never from the body), so a session can only delete itself.
 * Requires `{ confirm: true }` so it can't fire by accident; clients gate it behind a re-auth /
 * explicit confirmation step. Hard-deletes the auth user, so the session is invalid afterward.
 */
export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'account:delete', 5, 60_000)
  if (limited) return limited

  let body: { confirm?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    // tolerate an empty body below via the confirm check
  }
  if (body.confirm !== true) {
    return NextResponse.json({ error: 'Account deletion requires explicit confirmation.' }, { status: 400 })
  }

  const auth = await authenticateNexieRequest(request)
  if (!auth.ok) return auth.response

  const result = await deleteUserAccount(auth.user.id, auth.user.email ?? null)
  if (!result.ok) {
    console.error('[account/delete] failed', result.errors)
    return NextResponse.json({ error: 'Could not delete your account. Please contact support.' }, { status: 500 })
  }
  // The account IS deleted; surface any non-fatal data-cleanup issues for observability.
  if (result.errors.length) console.warn('[account/delete] partial cleanup issues', result.errors)
  return NextResponse.json({ ok: true })
}
