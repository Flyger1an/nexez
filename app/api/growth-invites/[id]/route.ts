import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { buildSellerGrowthInviteEmail, hasEmailEnv, sendEmail } from '../../../../lib/email'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { getSellerGrowthState } from '../../../../lib/server/seller-growth'
import {
  createSellerGrowthInviteToken,
  hashSellerGrowthInviteToken,
} from '../../../../lib/server/seller-growth-token'
import { appUrl } from '../../../../lib/site'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { createClient } from '../../../../utils/supabase/server'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  const limited = await enforceRateLimit(request, 'seller-growth-invite-update', 12, 60_000, {
    failClosed: true,
  })
  if (limited) return limited

  const supabase = createClient(await cookies())
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const ownerLimited = await enforceRateLimit(request, 'seller-growth-invite-update-owner', 8, 60_000, {
    subject: user.id,
    failClosed: true,
  })
  if (ownerLimited) return ownerLimited
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'Launch passes are unavailable on this deployment.' }, { status: 503 })
  }

  const { id } = await context.params
  const body = (await request.json().catch(() => ({}))) as { action?: 'resend' | 'revoke' }
  if (body.action !== 'resend' && body.action !== 'revoke') {
    return NextResponse.json({ error: 'Choose resend or revoke.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: invite } = await admin
    .from('seller_growth_invites')
    .select('id, campaign_id, inviter_owner_id, inviter_business_name, invitee_email, status, expires_at, delivery_count, last_sent_at')
    .eq('id', id)
    .eq('inviter_owner_id', user.id)
    .maybeSingle<{
      id: string
      campaign_id: string
      inviter_owner_id: string
      inviter_business_name: string
      invitee_email: string
      status: string
      expires_at: string
      delivery_count: number
      last_sent_at: string | null
  }>()
  if (!invite) return NextResponse.json({ error: 'Launch pass not found.' }, { status: 404 })
  if (body.action === 'revoke' && invite.status !== 'pending') {
    return NextResponse.json({ error: 'Only a pending Launch pass can be revoked.' }, { status: 409 })
  }
  if (body.action === 'resend' && invite.status !== 'pending' && invite.status !== 'expired') {
    return NextResponse.json({ error: 'Only a pending or expired Launch pass can be renewed.' }, { status: 409 })
  }
  if (
    body.action === 'resend'
    && invite.last_sent_at
    && Date.now() - Date.parse(invite.last_sent_at) < 60_000
  ) {
    return NextResponse.json(
      { error: 'Wait a minute before sending this invitation again.' },
      { status: 429, headers: { 'Retry-After': '60' } },
    )
  }

  if (body.action === 'revoke') {
    const { data: revoked, error } = await admin
      .from('seller_growth_invites')
      .update({ status: 'revoked' })
      .eq('id', invite.id)
      .eq('inviter_owner_id', user.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()
    if (error || !revoked) {
      return NextResponse.json({ error: 'This pass changed before it could be revoked.' }, { status: 409 })
    }
    await admin.from('seller_growth_events').insert({
      campaign_id: invite.campaign_id,
      owner_id: user.id,
      invite_id: invite.id,
      event_type: 'invite_revoked',
    })
    return NextResponse.json({ ok: true, status: 'revoked' })
  }

  const state = await getSellerGrowthState(admin, user.id, {
    createdAt: user.created_at,
    emailConfirmedAt: user.email_confirmed_at,
  })
  if (
    !state.campaign
    || state.campaign.id !== invite.campaign_id
    || state.campaign.status !== 'active'
    || (
      state.campaign.signupClosesAt
      && Date.parse(state.campaign.signupClosesAt) <= Date.now()
    )
  ) {
    return NextResponse.json({ error: 'This campaign is no longer accepting invitations.' }, { status: 409 })
  }
  if (!state.grant) {
    return NextResponse.json({ error: 'Your complimentary Launch access is no longer active.' }, { status: 403 })
  }

  const token = createSellerGrowthInviteToken()
  const tokenHash = hashSellerGrowthInviteToken(token)
  const expiresAt = new Date(
    Date.now() + state.campaign.inviteExpiresDays * 86_400_000,
  ).toISOString()
  const { data: updated, error } = await admin
    .from('seller_growth_invites')
    .update({
      token_hash: tokenHash,
      expires_at: expiresAt,
      status: 'pending',
    })
    .eq('id', invite.id)
    .eq('inviter_owner_id', user.id)
    .in('status', ['pending', 'expired'])
    .select('id')
    .maybeSingle()
  if (error || !updated) {
    return NextResponse.json({ error: 'This pass changed before it could be resent.' }, { status: 409 })
  }

  const claimUrl = appUrl(`/invite/${token}`)
  let emailed = false
  if (hasEmailEnv() && invite.delivery_count < 5) {
    const mail = await buildSellerGrowthInviteEmail({
      inviterBusinessName: invite.inviter_business_name,
      inviteeEmail: invite.invitee_email,
      durationDays: state.campaign.grantDurationDays,
      claimUrl,
    })
    const sent = await sendEmail({
      to: invite.invitee_email,
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
      .update({
        delivery_count: invite.delivery_count + 1,
        last_sent_at: sentAt,
      })
      .eq('id', invite.id)
      .eq('inviter_owner_id', user.id)
  }
  await admin.from('seller_growth_events').insert({
    campaign_id: invite.campaign_id,
    owner_id: user.id,
    invite_id: invite.id,
    grant_id: state.grant.id,
    event_type: 'invite_resent',
    metadata: { emailed },
  })

  return NextResponse.json({
    ok: true,
    emailed,
    claimUrl,
    expiresAt,
    deliveryCount: emailed ? invite.delivery_count + 1 : invite.delivery_count,
    lastSentAt: sentAt,
  })
}
