import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { buildSellerGrowthInviteEmail, hasEmailEnv, sendEmail } from '../../../lib/email'
import { enforceRateLimit } from '../../../lib/rate-limit'
import { getSellerGrowthState } from '../../../lib/server/seller-growth'
import {
  createSellerGrowthInviteToken,
  hashSellerGrowthInviteToken,
} from '../../../lib/server/seller-growth-token'
import { appUrl } from '../../../lib/site'
import { isValidEmail } from '../../../lib/team'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../utils/supabase/admin'
import { createClient } from '../../../utils/supabase/server'

export const dynamic = 'force-dynamic'

async function authenticatedOwner() {
  const supabase = createClient(await cookies())
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

export async function GET() {
  const user = await authenticatedOwner()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'Launch passes are unavailable on this deployment.' }, { status: 503 })
  }

  const state = await getSellerGrowthState(createAdminClient(), user.id, {
    createdAt: user.created_at,
    emailConfirmedAt: user.email_confirmed_at,
  })
  return NextResponse.json({ state }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'seller-growth-invite', 8, 60_000, {
    failClosed: true,
  })
  if (limited) return limited

  const user = await authenticatedOwner()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const ownerLimited = await enforceRateLimit(request, 'seller-growth-invite-owner', 6, 60_000, {
    subject: user.id,
    failClosed: true,
  })
  if (ownerLimited) return ownerLimited
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'Launch passes are unavailable on this deployment.' }, { status: 503 })
  }

  const body = (await request.json().catch(() => ({}))) as { email?: string }
  const email = String(body.email || '').trim().toLowerCase()
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Enter a valid business email.' }, { status: 400 })
  }
  if (email === String(user.email || '').toLowerCase()) {
    return NextResponse.json({ error: 'Send this pass to another business email.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const state = await getSellerGrowthState(admin, user.id, {
    createdAt: user.created_at,
    emailConfirmedAt: user.email_confirmed_at,
  })
  if (
    !state.campaign
    || state.campaign.status !== 'active'
    || (
      state.campaign.signupClosesAt
      && Date.parse(state.campaign.signupClosesAt) <= Date.now()
    )
  ) {
    return NextResponse.json({ error: 'The Launch pass campaign is not accepting invitations.' }, { status: 409 })
  }
  if (!state.grant) {
    return NextResponse.json(
      { error: 'Activate your complimentary Launch access before inviting another business.' },
      { status: 403 },
    )
  }
  if (state.slotsAvailable < 1) {
    return NextResponse.json({ error: 'Both of your Launch passes are already in use.' }, { status: 409 })
  }

  const token = createSellerGrowthInviteToken()
  const tokenHash = hashSellerGrowthInviteToken(token)
  const expiresAt = new Date(
    Date.now() + state.campaign.inviteExpiresDays * 86_400_000,
  ).toISOString()
  const { data: invite, error } = await admin
    .from('seller_growth_invites')
    .insert({
      campaign_id: state.campaign.id,
      inviter_owner_id: user.id,
      inviter_business_name: state.businessName,
      invitee_email: email,
      token_hash: tokenHash,
      status: 'pending',
      expires_at: expiresAt,
    })
    .select('id, invitee_email, status, expires_at, accepted_at, qualified_at, delivery_count, last_sent_at')
    .maybeSingle<{
      id: string
      invitee_email: string
      status: 'pending'
      expires_at: string
      accepted_at: string | null
      qualified_at: string | null
      delivery_count: number
      last_sent_at: string | null
    }>()

  if (error || !invite) {
    const duplicate = error?.code === '23505'
    const gate = error?.code === '23514'
      || /Launch pass|invitation campaign|campaign invitation|already in use/i.test(error?.message || '')
    return NextResponse.json(
      {
        error: duplicate
          ? 'That business already has an invitation in this campaign.'
          : gate
            ? error?.message
            : 'Could not create this Launch pass. Please try again.',
      },
      { status: duplicate || gate ? 409 : 500 },
    )
  }

  const claimUrl = appUrl(`/invite/${token}`)
  let emailed = false
  if (hasEmailEnv()) {
    const mail = await buildSellerGrowthInviteEmail({
      inviterBusinessName: state.businessName,
      inviteeEmail: email,
      durationDays: state.campaign.grantDurationDays,
      claimUrl,
    })
    const sent = await sendEmail({
      to: email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    })
    emailed = sent.ok
  }

  const sentAt = emailed ? new Date().toISOString() : null
  if (emailed) {
    await admin
      .from('seller_growth_invites')
      .update({ delivery_count: 1, last_sent_at: sentAt })
      .eq('id', invite.id)
      .eq('inviter_owner_id', user.id)
  }
  await admin.from('seller_growth_events').insert({
    campaign_id: state.campaign.id,
    owner_id: user.id,
    invite_id: invite.id,
    grant_id: state.grant.id,
    event_type: 'invite_created',
    metadata: { emailed },
  })

  return NextResponse.json({
    ok: true,
    emailed,
    claimUrl,
    invite: {
      id: invite.id,
      email: invite.invitee_email,
      status: invite.status,
      expiresAt: invite.expires_at,
      acceptedAt: invite.accepted_at,
      qualifiedAt: invite.qualified_at,
      deliveryCount: emailed ? 1 : invite.delivery_count,
      lastSentAt: sentAt,
    },
  })
}
