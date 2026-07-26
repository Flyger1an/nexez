import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../../test/supabase-mock'

const refs = vi.hoisted(() => ({
  user: {
    id: 'invitee-1',
    email: 'invitee@example.com',
    email_confirmed_at: '2026-07-25T00:00:00.000Z',
    created_at: '2026-07-25T00:00:00.000Z',
  } as any,
  cookieHash: 'a'.repeat(64),
  createAdminClient: vi.fn(),
  getSellerGrowthState: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => name === 'nexez_seller_growth_invite' ? { value: refs.cookieHash } : undefined,
  })),
}))
vi.mock('../../../../utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: refs.user } })) },
  })),
}))
vi.mock('../../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => true),
  createAdminClient: refs.createAdminClient,
}))
vi.mock('../../../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => null),
}))
vi.mock('../../../../lib/server/seller-growth', () => ({
  getSellerGrowthState: refs.getSellerGrowthState,
}))

import { POST } from './route'

const invite = {
  id: 'invite-1',
  campaign_id: 'campaign-1',
  inviter_owner_id: 'sender-1',
  invitee_email: 'invitee@example.com',
  status: 'pending',
  expires_at: '2099-01-01T00:00:00.000Z',
  accepted_by_owner_id: null,
}

const activeCampaign = {
  status: 'active',
  starts_at: '2026-01-01T00:00:00.000Z',
  signup_closes_at: '2099-01-01T00:00:00.000Z',
}

describe('POST /api/growth-invites/claim', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.user = {
      id: 'invitee-1',
      email: 'invitee@example.com',
      email_confirmed_at: '2026-07-25T00:00:00.000Z',
      created_at: '2026-07-25T00:00:00.000Z',
    }
    refs.getSellerGrowthState.mockResolvedValue({
      grant: { id: 'grant-1' },
    })
  })

  it('requires the exact verified email before mutating the invitation', async () => {
    refs.user = { ...refs.user, email: 'other@example.com' }
    const writes: QueryContext[] = []
    refs.createAdminClient.mockReturnValue(createSupabaseMock((ctx) => {
      if (ctx.op !== 'select') writes.push(ctx)
      if (ctx.table === 'seller_growth_invites' && ctx.op === 'select') return { data: invite }
      if (ctx.table === 'seller_growth_campaigns') return { data: activeCampaign }
      return { data: null, error: null }
    }) as any)

    const response = await POST(new Request('https://app.nexez.ai/api/growth-invites/claim', { method: 'POST' }))
    expect(response.status).toBe(403)
    expect((await response.json()).error).toContain('invitee@example.com')
    expect(writes).toHaveLength(0)
  })

  it('claims atomically, records the event, and clears the bearer cookie', async () => {
    const writes: Array<{ table: string; op: string; payload: any; calls: QueryContext['calls'] }> = []
    refs.createAdminClient.mockReturnValue(createSupabaseMock((ctx) => {
      if (ctx.op !== 'select') writes.push({ table: ctx.table, op: ctx.op, payload: ctx.payload, calls: ctx.calls })
      if (ctx.table === 'seller_growth_invites' && ctx.op === 'select') return { data: invite }
      if (ctx.table === 'seller_growth_campaigns') return { data: activeCampaign }
      if (ctx.table === 'seller_growth_invites' && ctx.op === 'update') return { data: { id: invite.id }, error: null }
      return { data: null, error: null }
    }) as any)

    const response = await POST(new Request('https://app.nexez.ai/api/growth-invites/claim', { method: 'POST' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ ok: true, activated: true })
    const claimWrite = writes.find((write) => write.table === 'seller_growth_invites')
    expect(claimWrite?.payload).toMatchObject({
      status: 'claimed',
      accepted_by_owner_id: 'invitee-1',
    })
    expect(claimWrite?.calls).toContainEqual(['eq', 'token_hash', refs.cookieHash])
    expect(claimWrite?.calls).toContainEqual(['eq', 'status', 'pending'])
    expect(writes.some((write) => write.table === 'seller_growth_events')).toBe(true)
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
  })

  it('refuses a pending pass after the campaign closes', async () => {
    const writes: QueryContext[] = []
    refs.createAdminClient.mockReturnValue(createSupabaseMock((ctx) => {
      if (ctx.op !== 'select') writes.push(ctx)
      if (ctx.table === 'seller_growth_invites' && ctx.op === 'select') return { data: invite }
      if (ctx.table === 'seller_growth_campaigns') {
        return {
          data: {
            ...activeCampaign,
            signup_closes_at: '2026-01-02T00:00:00.000Z',
          },
        }
      }
      return { data: null, error: null }
    }) as any)

    const response = await POST(new Request('https://app.nexez.ai/api/growth-invites/claim', { method: 'POST' }))

    expect(response.status).toBe(409)
    expect((await response.json()).error).toContain('no longer accepting claims')
    expect(writes).toHaveLength(0)
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
  })
})
