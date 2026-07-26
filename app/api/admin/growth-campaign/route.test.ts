import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  class GrowthControlError extends Error {
    constructor(message: string, readonly code: string) {
      super(message)
    }
  }
  return {
    user: { id: 'admin-1' } as null | { id: string },
    admin: true,
    limited: null as Response | null,
    apply: vi.fn(async () => ({
      available: true,
      campaign: { status: 'paused' },
      generatedAt: '2026-07-26T00:00:00.000Z',
    })),
    GrowthControlError,
  }
})

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({})) }))
vi.mock('../../../../utils/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }),
}))
vi.mock('../../../../lib/server/plan', () => ({ isPlatformAdmin: vi.fn(async () => state.admin) }))
vi.mock('../../../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => state.limited),
}))
vi.mock('../../../../lib/server/growth-control', () => ({
  GrowthControlError: state.GrowthControlError,
  applyGrowthCampaignControl: state.apply,
}))

import { PATCH } from './route'

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111'
const IDEMPOTENCY_KEY = '22222222-2222-4222-8222-222222222222'
const request = (body: unknown, origin: string | null = 'https://app.nexez.ai') => new Request(
  'https://app.nexez.ai/api/admin/growth-campaign',
  {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  },
)

describe('PATCH /api/admin/growth-campaign', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.user = { id: 'admin-1' }
    state.admin = true
    state.limited = null
  })

  it('requires a same-origin browser request', async () => {
    expect((await PATCH(request({}, null))).status).toBe(403)
    expect((await PATCH(request({}, 'https://nexez.ai'))).status).toBe(403)
    expect(state.apply).not.toHaveBeenCalled()
  })

  it('fails closed when the administrative rate limit is unavailable', async () => {
    state.limited = new Response(JSON.stringify({ error: 'Rate limit unavailable' }), { status: 503 })
    expect((await PATCH(request({}))).status).toBe(503)
    expect(state.apply).not.toHaveBeenCalled()
  })

  it('requires an authenticated platform administrator', async () => {
    state.user = null
    expect((await PATCH(request({}))).status).toBe(401)

    state.user = { id: 'member-1' }
    state.admin = false
    expect((await PATCH(request({}))).status).toBe(403)
    expect(state.apply).not.toHaveBeenCalled()
  })

  it('rejects malformed, unexplained, or over-broad mutations', async () => {
    const base = {
      campaignId: CAMPAIGN_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      reason: 'Capacity review',
    }
    expect((await PATCH(request({ ...base, action: 'delete' }))).status).toBe(400)
    expect((await PATCH(request({ ...base, action: 'pause', maxGrants: 5 }))).status).toBe(400)
    expect((await PATCH(request({ ...base, action: 'pause', reason: 'x' }))).status).toBe(400)
    expect(state.apply).not.toHaveBeenCalled()
  })

  it('applies a bounded, idempotent control as the authenticated actor', async () => {
    const response = await PATCH(request({
      campaignId: CAMPAIGN_ID,
      action: 'set_capacity',
      reason: 'Increase after quality review',
      idempotencyKey: IDEMPOTENCY_KEY,
      maxGrants: 1250,
    }))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(state.apply).toHaveBeenCalledWith({
      campaignId: CAMPAIGN_ID,
      action: 'set_capacity',
      reason: 'Increase after quality review',
      idempotencyKey: IDEMPOTENCY_KEY,
      maxGrants: 1250,
      signupClosesAt: null,
      actorId: 'admin-1',
    })
  })

  it('maps campaign conflicts without flattening them into server errors', async () => {
    state.apply.mockRejectedValueOnce(
      new state.GrowthControlError('Only an active campaign can be paused.', 'conflict'),
    )
    const response = await PATCH(request({
      campaignId: CAMPAIGN_ID,
      action: 'pause',
      reason: 'Pause for quality review',
      idempotencyKey: IDEMPOTENCY_KEY,
    }))

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'conflict' })
  })
})
