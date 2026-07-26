import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { getOwnerPlanId } from '../../../../lib/server/plan'
import { getSellerGrowthState } from '../../../../lib/server/seller-growth'
import { SELLER_GROWTH_INVITE_COOKIE } from '../../../../lib/server/seller-growth-token'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { createClient } from '../../../../utils/supabase/server'

type InviteRow = {
  id: string
  campaign_id: string
  inviter_owner_id: string
  invitee_email: string
  status: string
  expires_at: string
  accepted_by_owner_id: string | null
}

type CampaignRow = {
  status: string
  starts_at: string
  signup_closes_at: string | null
}

function clearClaimCookie(response: NextResponse) {
  response.cookies.set(SELLER_GROWTH_INVITE_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return response
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'seller-growth-claim', 8, 60_000, {
    failClosed: true,
  })
  if (limited) return limited

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to claim this Launch pass.' }, { status: 401 })
  const ownerLimited = await enforceRateLimit(request, 'seller-growth-claim-owner', 6, 60_000, {
    subject: user.id,
    failClosed: true,
  })
  if (ownerLimited) return ownerLimited
  if (!user.email || !user.email_confirmed_at) {
    return NextResponse.json({ error: 'Verify your email before claiming this Launch pass.' }, { status: 403 })
  }
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'Launch passes are unavailable on this deployment.' }, { status: 503 })
  }

  const tokenHash = cookieStore.get(SELLER_GROWTH_INVITE_COOKIE)?.value || ''
  if (!/^[a-f0-9]{64}$/.test(tokenHash)) {
    return NextResponse.json({ error: 'Open the original invitation link to continue.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: invite } = await admin
    .from('seller_growth_invites')
    .select('id, campaign_id, inviter_owner_id, invitee_email, status, expires_at, accepted_by_owner_id')
    .eq('token_hash', tokenHash)
    .maybeSingle<InviteRow>()
  if (!invite) {
    return clearClaimCookie(NextResponse.json({ error: 'This Launch pass is invalid.' }, { status: 404 }))
  }

  if (
    (invite.status === 'claimed' || invite.status === 'qualified')
    && invite.accepted_by_owner_id === user.id
  ) {
    const state = await getSellerGrowthState(admin, user.id, {
      createdAt: user.created_at,
      emailConfirmedAt: user.email_confirmed_at,
    })
    return clearClaimCookie(NextResponse.json({ ok: true, alreadyClaimed: true, state }))
  }

  const { data: campaign } = await admin
    .from('seller_growth_campaigns')
    .select('status, starts_at, signup_closes_at')
    .eq('id', invite.campaign_id)
    .maybeSingle<CampaignRow>()
  const nowMs = Date.now()
  if (
    !campaign
    || campaign.status !== 'active'
    || Date.parse(campaign.starts_at) > nowMs
    || (
      campaign.signup_closes_at
      && Date.parse(campaign.signup_closes_at) <= nowMs
    )
  ) {
    return clearClaimCookie(
      NextResponse.json({ error: 'This Launch pass campaign is no longer accepting claims.' }, { status: 409 }),
    )
  }

  if (await getOwnerPlanId(admin, user.id) !== 'free') {
    return clearClaimCookie(
      NextResponse.json(
        { error: 'This account already has paid or promotional plan access.' },
        { status: 409 },
      ),
    )
  }

  if (invite.status !== 'pending') {
    return clearClaimCookie(
      NextResponse.json({ error: 'This Launch pass is no longer available.' }, { status: 409 }),
    )
  }
  if (Date.parse(invite.expires_at) <= Date.now()) {
    await admin
      .from('seller_growth_invites')
      .update({ status: 'expired' })
      .eq('id', invite.id)
      .eq('status', 'pending')
    await admin.from('seller_growth_events').insert({
      campaign_id: invite.campaign_id,
      invite_id: invite.id,
      event_type: 'invite_expired',
    })
    return clearClaimCookie(
      NextResponse.json({ error: 'This Launch pass has expired. Ask the sender to renew it.' }, { status: 410 }),
    )
  }
  if (invite.inviter_owner_id === user.id) {
    return NextResponse.json({ error: 'You cannot claim a pass sent by your own business.' }, { status: 400 })
  }
  if (invite.invitee_email !== user.email.toLowerCase()) {
    return NextResponse.json(
      { error: `Sign in with ${invite.invitee_email} to claim this Launch pass.` },
      { status: 403 },
    )
  }

  const acceptedAt = new Date().toISOString()
  const { data: claimed, error } = await admin
    .from('seller_growth_invites')
    .update({
      status: 'claimed',
      accepted_by_owner_id: user.id,
      accepted_at: acceptedAt,
    })
    .eq('id', invite.id)
    .eq('token_hash', tokenHash)
    .eq('status', 'pending')
    .gt('expires_at', acceptedAt)
    .select('id')
    .maybeSingle<{ id: string }>()

  if (error || !claimed) {
    const alreadyUsed = error?.code === '23505'
    return NextResponse.json(
      {
        error: alreadyUsed
          ? 'This business already claimed a Launch pass in this campaign.'
          : 'This Launch pass changed before it could be claimed. Refresh and try again.',
      },
      { status: 409 },
    )
  }

  await admin.from('seller_growth_events').insert({
    campaign_id: invite.campaign_id,
    owner_id: user.id,
    invite_id: invite.id,
    event_type: 'invite_claimed',
  })

  const state = await getSellerGrowthState(admin, user.id, {
    createdAt: user.created_at,
    emailConfirmedAt: user.email_confirmed_at,
  })
  return clearClaimCookie(NextResponse.json({
    ok: true,
    activated: Boolean(state.grant),
    state,
  }))
}
