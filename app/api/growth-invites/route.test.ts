import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../test/supabase-mock'
import { hashSellerGrowthInviteToken } from '../../../lib/server/seller-growth-token'

const refs = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getSellerGrowthState: vi.fn(),
  user: {
    id: 'owner-1',
    email: 'owner@example.com',
    email_confirmed_at: '2026-07-25T00:00:00.000Z',
    created_at: '2026-07-25T00:00:00.000Z',
  },
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({})) }))
vi.mock('../../../utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: refs.user } })) },
  })),
}))
vi.mock('../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => true),
  createAdminClient: refs.createAdminClient,
}))
vi.mock('../../../lib/server/seller-growth', () => ({
  getSellerGrowthState: refs.getSellerGrowthState,
}))
vi.mock('../../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => null),
}))
vi.mock('../../../lib/email', () => ({
  hasEmailEnv: vi.fn(() => false),
  buildSellerGrowthInviteEmail: vi.fn(),
  sendEmail: vi.fn(),
}))

import { POST } from './route'

describe('POST /api/growth-invites', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.getSellerGrowthState.mockResolvedValue({
      campaign: {
        id: 'campaign-1',
        status: 'active',
        inviteExpiresDays: 14,
        grantDurationDays: 180,
      },
      grant: { id: 'grant-1' },
      slotsAvailable: 2,
      businessName: 'Acme Studio',
    })
  })

  it('stores only the token hash and returns the one-time raw claim URL to its owner', async () => {
    let insertPayload: Record<string, unknown> | null = null
    refs.createAdminClient.mockReturnValue(createSupabaseMock((ctx: QueryContext) => {
      if (ctx.table === 'seller_growth_invites' && ctx.op === 'insert') {
        insertPayload = ctx.payload
        return {
          data: {
            id: 'invite-1',
            invitee_email: 'new@example.com',
            status: 'pending',
            expires_at: ctx.payload.expires_at,
            accepted_at: null,
            qualified_at: null,
            delivery_count: 0,
            last_sent_at: null,
          },
          error: null,
        }
      }
      return { data: null, error: null }
    }) as any)

    const response = await POST(new Request('https://app.nexez.ai/api/growth-invites', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'NEW@EXAMPLE.COM' }),
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      ok: true,
      emailed: false,
      invite: { email: 'new@example.com', status: 'pending' },
    })
    expect(insertPayload).toMatchObject({
      campaign_id: 'campaign-1',
      inviter_owner_id: 'owner-1',
      inviter_business_name: 'Acme Studio',
      invitee_email: 'new@example.com',
      status: 'pending',
    })
    const rawToken = new URL(body.claimUrl).pathname.split('/').pop() || ''
    expect(rawToken).toMatch(/^[A-Za-z0-9_-]{40,64}$/)
    expect(insertPayload?.token_hash).toBe(hashSellerGrowthInviteToken(rawToken))
    expect(JSON.stringify(insertPayload)).not.toContain(rawToken)
  })
})
