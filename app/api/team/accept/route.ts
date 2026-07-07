import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../utils/supabase/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { enforceRateLimit } from '../../../../lib/rate-limit'

/**
 * Accept the caller's pending team invitations. Collaborator page access now requires an
 * ACCEPTED invite (migration 20260626001500) - a merely-pending invite no longer grants
 * access. The invitee reaches this from the invite email's "Accept" link (/team/accept),
 * which flips every pending invite addressed to their VERIFIED, CONFIRMED email to
 * 'accepted'.
 *
 * Writes via the service-role client because the invitee has no RLS UPDATE on
 * team_invites (only owners manage their own invites). Strictly scoped to the caller's
 * own confirmed email + status='pending' (revoked stays revoked), so it can only ever
 * accept invitations addressed to the caller - never another address, never un-revoke.
 */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'team-accept', 20, 60_000)
  if (limited) return limited

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const email = (user.email || '').trim().toLowerCase()
  // The collaborator grant joins on the verified email, so only a CONFIRMED address may
  // accept (mirrors resolvePageAccess's confirmation requirement). Fails closed otherwise.
  if (!email || !user.email_confirmed_at) {
    return NextResponse.json({ error: 'Confirm your email address before accepting invitations.' }, { status: 403 })
  }
  if (!hasSupabaseAdminEnv()) return NextResponse.json({ error: 'Service unavailable.' }, { status: 503 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('team_invites')
    .update({ status: 'accepted' })
    .eq('email', email)
    .eq('status', 'pending')
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, accepted: data?.length ?? 0 })
}
