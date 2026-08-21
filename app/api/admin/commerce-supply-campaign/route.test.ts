import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  class CommerceSupplyCampaignError extends Error {
    constructor(message: string, readonly code: string) {
      super(message)
    }
  }
  return {
    user: { id: 'admin-1' } as null | { id: string },
    admin: true,
    limited: null as Response | null,
    apply: vi.fn(async () => ({
      referenceId: 'events.private-chef',
      status: 'sourcing',
    })),
    CommerceSupplyCampaignError,
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
vi.mock('../../../../lib/server/commerce-supply-workflow', () => ({
  CommerceSupplyCampaignError: state.CommerceSupplyCampaignError,
  applyCommerceSupplyCampaign: state.apply,
}))

import { PATCH } from './route'

const request = (body: unknown, origin: string | null = 'https://app.nexez.ai') => new Request(
  'https://app.nexez.ai/api/admin/commerce-supply-campaign',
  {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  },
)

const validBody = {
  referenceId: 'events.private-chef',
  status: 'sourcing',
  reason: 'Recruit two qualified operators',
  idempotencyKey: '22222222-2222-4222-8222-222222222222',
}

describe('PATCH /api/admin/commerce-supply-campaign', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.user = { id: 'admin-1' }
    state.admin = true
    state.limited = null
  })

  it('requires a same-origin browser request', async () => {
    expect((await PATCH(request(validBody, null))).status).toBe(403)
    expect((await PATCH(request(validBody, 'https://nexez.ai'))).status).toBe(403)
    expect(state.apply).not.toHaveBeenCalled()
  })

  it('fails closed when the administrative rate limit is unavailable', async () => {
    state.limited = new Response(JSON.stringify({ error: 'Rate limit unavailable' }), { status: 503 })
    expect((await PATCH(request(validBody))).status).toBe(503)
    expect(state.apply).not.toHaveBeenCalled()
  })

  it('requires an authenticated platform administrator', async () => {
    state.user = null
    expect((await PATCH(request(validBody))).status).toBe(401)

    state.user = { id: 'member-1' }
    state.admin = false
    expect((await PATCH(request(validBody))).status).toBe(403)
    expect(state.apply).not.toHaveBeenCalled()
  })

  it('rejects unknown fields, unexplained transitions, and malformed references', async () => {
    expect((await PATCH(request({ ...validBody, status: 'live' }))).status).toBe(400)
    expect((await PATCH(request({ ...validBody, reason: 'x' }))).status).toBe(400)
    expect((await PATCH(request({ ...validBody, referenceId: '../private-chef' }))).status).toBe(400)
    expect((await PATCH(request({ ...validBody, rawQuery: 'find me a chef' }))).status).toBe(400)
    expect(state.apply).not.toHaveBeenCalled()
  })

  it('applies the bounded transition as the authenticated actor', async () => {
    const response = await PATCH(request(validBody))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(state.apply).toHaveBeenCalledWith({ ...validBody, actorId: 'admin-1' })
  })

  it('preserves typed workflow conflicts', async () => {
    state.apply.mockRejectedValueOnce(
      new state.CommerceSupplyCampaignError('Refresh Launch Control.', 'not_found'),
    )
    const response = await PATCH(request(validBody))
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: 'not_found' })
  })

  it('returns service unavailable when marketplace certification cannot be verified', async () => {
    state.apply.mockRejectedValueOnce(
      new state.CommerceSupplyCampaignError('Refresh Launch Control.', 'verification_unavailable'),
    )
    const response = await PATCH(request(validBody))
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'verification_unavailable' })
  })
})
