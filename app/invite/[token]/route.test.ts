import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../test/supabase-mock'
import { hashSellerGrowthInviteToken } from '../../../lib/server/seller-growth-token'

const refs = vi.hoisted(() => ({ createAdminClient: vi.fn() }))
vi.mock('../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => true),
  createAdminClient: refs.createAdminClient,
}))

import { GET } from './route'

describe('GET /invite/[token]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('exchanges the raw URL token for a hashed HttpOnly cookie and redirects cleanly', async () => {
    const token = 'A'.repeat(43)
    refs.createAdminClient.mockReturnValue(createSupabaseMock((ctx: QueryContext) => {
      if (ctx.table === 'seller_growth_invites') {
        return {
          data: {
            id: 'invite-1',
            campaign_id: 'campaign-1',
            status: 'pending',
            expires_at: '2099-01-01T00:00:00.000Z',
          },
          error: null,
        }
      }
      if (ctx.table === 'seller_growth_campaigns') {
        return {
          data: {
            status: 'active',
            starts_at: '2026-01-01T00:00:00.000Z',
            signup_closes_at: '2099-01-01T00:00:00.000Z',
          },
          error: null,
        }
      }
      return { data: null, error: null }
    }) as any)

    const response = await GET(
      new Request(`https://app.nexez.ai/invite/${token}`),
      { params: Promise.resolve({ token }) },
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toMatch(/\/invite\/claim$/)
    expect(response.headers.get('location')).not.toContain(token)
    const cookie = response.headers.get('set-cookie') || ''
    expect(cookie).toContain(hashSellerGrowthInviteToken(token))
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Path=/')
    expect(cookie).not.toContain(token)
  })
})
