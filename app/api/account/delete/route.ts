import { NextResponse, type NextRequest } from 'next/server'
import { authenticateNexieRequest } from '../../../../lib/agents/nexie-auth'
import { hasRecentInteractiveAuthentication } from '../../../../lib/auth-recent'
import { deleteUserAccount } from '../../../../lib/server/delete-account'
import { enforceRateLimit } from '../../../../lib/rate-limit'

export const maxDuration = 30

/**
 * POST /api/account/delete - delete the authenticated user's NEXXI BUYER account (App Store
 * Guideline 5.1.1(v) + GDPR/CCPA). The target is ALWAYS the session user (cookie on web, bearer
 * token in the Nexxi app - never from the body), so a session can only delete itself. Requires
 * `{ confirm: true }` so it can't fire by accident.
 *
 * Nexxi shares one login with the Nexez seller dashboard but they are separate facets: this clears
 * the BUYER facet always, and only deletes the auth user when the account does NOT also sell on
 * Nexez (so deleting in the buyer app never destroys someone's seller business). The response's
 * `sellerRetained` tells the client whether the login + seller account were kept.
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

  const bearerToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  const { data: claimsData, error: claimsError } = bearerToken
    ? await auth.db.auth.getClaims(bearerToken)
    : await auth.db.auth.getClaims()
  if (claimsError || !hasRecentInteractiveAuthentication(claimsData?.claims)) {
    return NextResponse.json(
      {
        error: 'Confirm your identity again before deleting your Nexxi buyer data.',
        code: 'recent_auth_required',
      },
      { status: 403, headers: { 'cache-control': 'no-store' } },
    )
  }

  const result = await deleteUserAccount(auth.user.id, auth.user.email ?? null)
  if (!result.ok) {
    console.error('[account/delete] failed', result.errors)
    return NextResponse.json({ error: 'Could not delete your account. Please contact support.' }, { status: 500 })
  }
  // Buyer data is cleared; surface any non-fatal cleanup issues for observability.
  if (result.errors.length) console.warn('[account/delete] partial cleanup issues', result.errors)
  // sellerRetained=true → the account also sells on Nexez, so its seller data + login were KEPT;
  // the client should message that instead of "your account is gone".
  return NextResponse.json({ ok: true, sellerRetained: result.sellerRetained })
}
