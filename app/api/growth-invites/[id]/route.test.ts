import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../../test/supabase-mock'
import { hashSellerGrowthInviteToken } from '../../../../lib/server/seller-growth-token'

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
vi.mock('../../../../utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: refs.user } })) },
  })),
}))
vi.mock('../../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => true),
  createAdminClient: refs.createAdminClient,
}))
vi.mock('../../../../lib/server/seller-growth', () => ({
  getSellerGrowthState: refs.getSellerGrowthState,
}))
vi.mock('../../../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => null),
}))
vi.mock('../../../../lib/email', () => ({
  hasEmailEnv: vi.fn(() => false),
  buildSellerGrowthInviteEmail: vi.fn(),
  sendEmail: vi.fn(),
}))

import { PATCH } from './route'

const invite = {
  id: 'invite-1',
  campaign_id: 'campaign-1',
  inviter_owner_id: 'owner-1',
  inviter_business_name: 'Acme Studio',
  invitee_email: 'new@example.com',
  status: 'expired',
  expires_at: '2026-07-01T00:00:00.000Z',
  delivery_count: 1,
  last_sent_at: '2026-06-01T00:00:00.000Z',
}

describe('PATCH /api/growth-invites/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.getSellerGrowthState.mockResolvedValue({
      campaign: {
        id: 'campaign-1',
        status: 'active',
        inviteExpiresDays: 14,
        grantDurationDays: 180,
        signupClosesAt: '2099-01-01T00:00:00.000Z',
      },
      grant: { id: 'grant-1' },
    })
  })

  it('renews an expired owner-scoped pass with a fresh hashed token', async () => {
    const writes: Array<{ table: string; payload: Record<string, unknown>; calls: QueryContext['calls'] }> = []
    refs.createAdminClient.mockReturnValue(createSupabaseMock((ctx) => {
      if (ctx.op !== 'select') {
        writes.push({
          table: ctx.table,
          payload: (ctx.payload ?? {}) as Record<string, unknown>,
          calls: ctx.calls,
        })
      }
      if (ctx.table === 'seller_growth_invites' && ctx.op === 'select') {
        return { data: invite, error: null }
      }
      if (ctx.table === 'seller_growth_invites' && ctx.op === 'update') {
        return { data: { id: invite.id }, error: null }
      }
      return { data: null, error: null }
    }) as any)

    const response = await PATCH(
      new Request('https://app.nexez.ai/api/growth-invites/invite-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'resend' }),
      }),
      { params: Promise.resolve({ id: invite.id }) },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ ok: true, emailed: false })
    const rawToken = new URL(body.claimUrl).pathname.split('/').pop() || ''
    const renewal = writes.find((write) => write.table === 'seller_growth_invites')
    expect(rawToken).toMatch(/^[A-Za-z0-9_-]{40,64}$/)
    expect(renewal?.payload).toMatchObject({
      token_hash: hashSellerGrowthInviteToken(rawToken),
      status: 'pending',
    })
    expect(renewal?.calls).toContainEqual(['eq', 'inviter_owner_id', refs.user.id])
    expect(renewal?.calls).toContainEqual(['in', 'status', ['pending', 'expired']])
    expect(JSON.stringify(renewal?.payload)).not.toContain(rawToken)
  })

  it('enforces a cooldown before rotating a freshly emailed pending pass', async () => {
    const writes: QueryContext[] = []
    refs.createAdminClient.mockReturnValue(createSupabaseMock((ctx) => {
      if (ctx.op !== 'select') writes.push(ctx)
      if (ctx.table === 'seller_growth_invites' && ctx.op === 'select') {
        return {
          data: {
            ...invite,
            status: 'pending',
            last_sent_at: new Date().toISOString(),
          },
          error: null,
        }
      }
      return { data: null, error: null }
    }) as any)

    const response = await PATCH(
      new Request('https://app.nexez.ai/api/growth-invites/invite-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'resend' }),
      }),
      { params: Promise.resolve({ id: invite.id }) },
    )

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('60')
    expect(writes).toHaveLength(0)
  })
})
