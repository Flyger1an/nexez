import { describe, expect, it, vi } from 'vitest'
import { createSupabaseMock } from '../../test/supabase-mock'
import { getSellerGrowthState } from './seller-growth'

const now = Date.now()
const campaign = {
  id: 'campaign-1',
  campaign_key: 'launch-six-month-2026',
  name: 'Six months of Launch',
  status: 'active',
  grant_plan_id: 'launch',
  grant_duration_days: 180,
  invite_slots: 2,
  invite_expires_days: 14,
  starts_at: new Date(now - 86_400_000).toISOString(),
  signup_closes_at: null,
}
const grant = {
  id: 'grant-1',
  campaign_id: campaign.id,
  plan_id: 'launch',
  source: 'welcome',
  starts_at: new Date(now - 3_600_000).toISOString(),
  ends_at: new Date(now + 180 * 86_400_000).toISOString(),
  fallback_page_id: null,
}
const pages = [{
  id: 'page-1',
  name: 'Acme Studio',
  slug: 'acme',
  is_published: true,
  website_verified_at: new Date(now - 1_000).toISOString(),
  custom_domain_verified: null,
}]

function adminFor(opts: {
  grant?: typeof grant | null
  acceptedInvite?: Record<string, unknown> | null
  sentInvites?: Array<Record<string, unknown>>
}) {
  const db = createSupabaseMock((ctx) => {
    if (ctx.table === 'seller_growth_campaigns') return { data: campaign, error: null }
    if (ctx.table === 'promotional_plan_grants') return { data: opts.grant ?? null, error: null }
    if (ctx.table === 'pages') return { data: pages, error: null }
    if (ctx.table === 'billing_subscriptions') return { data: { stripe_connect_charges_enabled: false }, error: null }
    if (ctx.table === 'shopify_installs') return { data: [], error: null }
    if (ctx.table === 'seller_growth_invites' && ctx.eqs.inviter_owner_id) {
      return { data: opts.sentInvites ?? [], error: null }
    }
    if (ctx.table === 'seller_growth_invites' && ctx.eqs.accepted_by_owner_id) {
      return { data: opts.acceptedInvite ?? null, error: null }
    }
    return { data: null, error: null }
  })
  return { ...db, rpc: vi.fn(async () => ({ data: opts.grant?.id ?? null, error: null })) } as any
}

describe('getSellerGrowthState', () => {
  it('returns an owner-safe qualified campaign state and counts only live slots', async () => {
    const activeInvite = {
      id: 'invite-1',
      campaign_id: campaign.id,
      invitee_email: 'one@example.com',
      status: 'pending',
      expires_at: new Date(now + 86_400_000).toISOString(),
      accepted_at: null,
      qualified_at: null,
      delivery_count: 1,
      last_sent_at: new Date(now - 1_000).toISOString(),
    }
    const expiredInvite = {
      ...activeInvite,
      id: 'invite-2',
      invitee_email: 'two@example.com',
      status: 'expired',
      expires_at: new Date(now - 86_400_000).toISOString(),
    }
    const admin = adminFor({ grant, sentInvites: [activeInvite, expiredInvite] })
    const state = await getSellerGrowthState(admin, 'owner-1', {
      createdAt: new Date(now).toISOString(),
      emailConfirmedAt: new Date(now).toISOString(),
    })

    expect(admin.rpc).toHaveBeenCalledWith('refresh_seller_growth_grant', { p_owner: 'owner-1' })
    expect(state).toMatchObject({
      available: true,
      businessName: 'Acme Studio',
      slotsUsed: 1,
      slotsAvailable: 1,
      grant: { id: 'grant-1', planId: 'launch', source: 'welcome' },
      qualification: {
        emailVerified: true,
        publishedListing: true,
        identityVerified: true,
        identityMethods: ['website'],
        campaignAccess: true,
        accessSource: 'new_business',
        eligible: true,
      },
    })
    expect(JSON.stringify(state)).not.toContain('token_hash')
  })

  it('does not promise campaign access to an older, uninvited account', async () => {
    const state = await getSellerGrowthState(adminFor({ grant: null }), 'owner-1', {
      createdAt: new Date(now - 30 * 86_400_000).toISOString(),
      emailConfirmedAt: new Date(now).toISOString(),
    })

    expect(state.grant).toBeNull()
    expect(state.qualification).toMatchObject({
      campaignAccess: false,
      accessSource: 'none',
      eligible: false,
    })
  })
})
