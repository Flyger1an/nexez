import { NextResponse } from 'next/server'
import {
  hashSellerGrowthInviteToken,
  isSellerGrowthInviteToken,
  SELLER_GROWTH_INVITE_COOKIE,
} from '../../../lib/server/seller-growth-token'
import { appUrl } from '../../../lib/site'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../utils/supabase/admin'

type RouteContext = { params: Promise<{ token: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params
  const invalid = () => {
    const response = NextResponse.redirect(appUrl('/invite/claim?state=invalid'))
    response.cookies.set(SELLER_GROWTH_INVITE_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })
    response.headers.set('Cache-Control', 'no-store')
    return response
  }

  if (!hasSupabaseAdminEnv() || !isSellerGrowthInviteToken(token)) return invalid()

  const tokenHash = hashSellerGrowthInviteToken(token)
  const admin = createAdminClient()
  const { data: invite } = await admin
    .from('seller_growth_invites')
    .select('id, campaign_id, status, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle<{ id: string; campaign_id: string; status: string; expires_at: string }>()

  if (!invite || invite.status !== 'pending' || Date.parse(invite.expires_at) <= Date.now()) {
    return invalid()
  }

  const { data: campaign } = await admin
    .from('seller_growth_campaigns')
    .select('status, starts_at, signup_closes_at')
    .eq('id', invite.campaign_id)
    .maybeSingle<{ status: string; starts_at: string; signup_closes_at: string | null }>()
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
    return invalid()
  }

  const response = NextResponse.redirect(appUrl('/invite/claim'))
  response.cookies.set(SELLER_GROWTH_INVITE_COOKIE, tokenHash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.max(60, Math.floor((Date.parse(invite.expires_at) - Date.now()) / 1000)),
  })
  response.headers.set('Cache-Control', 'no-store')
  return response
}
