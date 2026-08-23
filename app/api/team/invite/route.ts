import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../utils/supabase/server'
import { isValidEmail, TEAM_ROLES, type TeamRole } from '../../../../lib/team'
import { buildTeamInviteEmail, hasEmailEnv, sendEmail } from '../../../../lib/email'
import { appUrl } from '../../../../lib/site'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { minPlanForFeature, planAllows } from '../../../../lib/billing'
import { getOwnerPlanId } from '../../../../lib/server/plan'
import {
  entitlementAllocationRetryBody,
  entitlementAllocationRetryInit,
  isEntitlementAllocationRetry,
} from '../../../../lib/entitlement-allocation-error'

function allocationRetryResponse() {
  return NextResponse.json(entitlementAllocationRetryBody, entitlementAllocationRetryInit)
}

/**
 * Create a team invite AND notify the invitee. Invites were previously a silent
 * client-side DB write - the teammate was never told, so collaboration never
 * started. This inserts via the OWNER's session client (so owner-scoped invite
 * RLS + the Pro/admin plan-gate trigger still apply), then emails the
 * invitee a link to sign in/up with that exact address (the access RLS keys on the
 * JWT email). Unlisted /api/* → app host, so the owner session is preserved.
 */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'team-invite', 20, 60_000)
  if (limited) return limited

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as { email?: string; role?: string }
  const email = String(body.email || '').trim().toLowerCase()
  const role = String(body.role || 'editor') as TeamRole
  if (!isValidEmail(email)) return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 })
  if (!TEAM_ROLES.includes(role)) return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
  if (email === (user.email || '').toLowerCase()) {
    return NextResponse.json({ error: 'You already own this workspace.' }, { status: 400 })
  }

  // Dedup: if this teammate already has a live (non-revoked) invite, DON'T insert a
  // duplicate or re-send the email - that would let an owner re-email one address on
  // a loop. (email is lowercased above + on insert, so an exact match is safe.) Return
  // the existing invite so the UI can say "already invited".
  const { data: existing } = await supabase
    .from('team_invites')
    .select('id, email, role, status, created_at')
    .eq('owner_id', user.id)
    .eq('email', email)
    .neq('status', 'revoked')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; email: string; role: string; status: string; created_at: string }>()
  if (existing) {
    return NextResponse.json({ ok: true, invite: existing, alreadyInvited: true, emailed: false })
  }

  // Insert through the owner's session client -> owner-scoped RLS +
  // the trg_enforce_team_collaboration plan gate both apply. The gate raises a
  // check_violation (23514) for both the Pro feature gate and the per-plan seat limit;
  // surface either as 402 (with the DB's own message) so the UI can prompt an upgrade.
  const { data: invite, error } = await supabase
    .from('team_invites')
    .insert({ owner_id: user.id, email, role })
    .select('id, email, role, status, created_at')
    .maybeSingle<{ id: string; email: string; role: string; status: string; created_at: string }>()
  if (error) {
    if (isEntitlementAllocationRetry(error)) return allocationRetryResponse()
    const isPlanGate = error.code === '23514' || /plan feature|seat limit/i.test(error.message)
    return NextResponse.json(
      { error: error.message },
      { status: isPlanGate ? 402 : 400 },
    )
  }

  // Notify the invitee. Awaited (not after()) so the response reports ACTUAL delivery
  // - sendEmail never throws (returns {ok}); we don't want to claim "sent" when the
  // email was skipped (no RESEND) or rejected.
  let emailed = false
  if (hasEmailEnv()) {
    const mail = await buildTeamInviteEmail({
      inviterEmail: user.email || 'A Nexez user',
      inviteeEmail: email,
      role,
      acceptUrl: appUrl('/team/accept'),
    })
    const sent = await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text })
    emailed = sent.ok
  }

  return NextResponse.json({ ok: true, invite, emailed })
}

/**
 * Update an existing invite through the same authenticated, owner-scoped boundary
 * used to create it. Keeping revoke and role changes out of the browser's direct
 * table writes gives the settings UI one auditable contract and lets failures be
 * reported instead of silently disappearing after a reload.
 */
export async function PATCH(request: Request) {
  const limited = await enforceRateLimit(request, 'team-invite-update', 30, 60_000)
  if (limited) return limited

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as {
    id?: unknown
    action?: unknown
    role?: unknown
  }
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  const action = body.action === 'revoke' || body.action === 'role' ? body.action : null
  if (!id || id.length > 128) return NextResponse.json({ error: 'A valid invite ID is required.' }, { status: 400 })
  if (!action) return NextResponse.json({ error: 'Action must be revoke or role.' }, { status: 400 })

  const patch: { status?: 'revoked'; role?: TeamRole } = {}
  if (action === 'revoke') patch.status = 'revoked'
  if (action === 'role') {
    const role = typeof body.role === 'string' ? body.role as TeamRole : null
    if (!role || !TEAM_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
    }
    const planId = await getOwnerPlanId(supabase, user.id)
    if (!planAllows(planId, 'teamCollaboration')) {
      const required = minPlanForFeature('teamCollaboration')
      return NextResponse.json(
        {
          error: `Role changes require the ${required.name} plan. You can still revoke retained access.`,
          code: 'plan_feature_required',
          upgrade: required.id,
        },
        { status: 402 },
      )
    }
    patch.role = role
  }

  const { data: invite, error } = await supabase
    .from('team_invites')
    .update(patch)
    .eq('owner_id', user.id)
    .eq('id', id)
    .select('id, email, role, status, created_at')
    .maybeSingle<{ id: string; email: string; role: string; status: string; created_at: string }>()

  if (error) {
    if (isEntitlementAllocationRetry(error)) return allocationRetryResponse()
    const isPlanGate = error.code === '23514' || /plan feature|seat limit/i.test(error.message)
    return NextResponse.json({ error: error.message }, { status: isPlanGate ? 402 : 400 })
  }
  if (!invite) return NextResponse.json({ error: 'Invite not found.' }, { status: 404 })

  return NextResponse.json({ ok: true, invite })
}
