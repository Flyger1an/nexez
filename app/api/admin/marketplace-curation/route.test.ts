import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  class MarketplaceCurationError extends Error {
    constructor(message: string, readonly code: string) {
      super(message)
    }
  }
  return {
    user: { id: 'admin-1' } as null | { id: string },
    admin: true,
    update: vi.fn(async (input: any) => ({
      page: { id: input.pageId, name: 'Northstar Strategy' },
      decision: { status: input.status },
      assessment: { blockerCount: 0 },
    })),
    MarketplaceCurationError,
  }
})

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({})) }))
vi.mock('../../../../utils/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }),
}))
vi.mock('../../../../lib/server/plan', () => ({ isPlatformAdmin: vi.fn(async () => state.admin) }))
vi.mock('../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('../../../../lib/server/marketplace-curation', () => ({
  MarketplaceCurationError: state.MarketplaceCurationError,
  updateMarketplaceCuration: state.update,
}))

import { PATCH } from './route'

const PAGE_ID = '11111111-1111-4111-8111-111111111111'
const request = (body: unknown) => new Request('https://app.nexez.ai/api/admin/marketplace-curation', {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

describe('PATCH /api/admin/marketplace-curation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.user = { id: 'admin-1' }
    state.admin = true
    state.update.mockImplementation(async (input: any) => ({
      page: { id: input.pageId, name: 'Northstar Strategy' },
      decision: { status: input.status },
      assessment: { blockerCount: 0 },
    }))
  })

  it('requires an authenticated platform admin', async () => {
    state.user = null
    expect((await PATCH(request({ pageId: PAGE_ID, status: 'candidate' }))).status).toBe(401)

    state.user = { id: 'member-1' }
    state.admin = false
    expect((await PATCH(request({ pageId: PAGE_ID, status: 'candidate' }))).status).toBe(403)
    expect(state.update).not.toHaveBeenCalled()
  })

  it('rejects malformed and over-broad decisions', async () => {
    expect((await PATCH(request({ pageId: 'bad', status: 'candidate' }))).status).toBe(400)
    expect((await PATCH(request({ pageId: PAGE_ID, status: 'featured' }))).status).toBe(400)
    expect((await PATCH(request({ pageId: PAGE_ID, status: 'candidate', ownerId: 'someone-else' }))).status).toBe(400)
  })

  it('persists a bounded decision with the authenticated actor', async () => {
    const response = await PATCH(request({
      pageId: PAGE_ID,
      status: 'excluded',
      decisionReason: 'Internal QA listing',
      notes: 'Keep direct certification URL live.',
    }))
    expect(response.status).toBe(200)
    expect(state.update).toHaveBeenCalledWith(expect.objectContaining({
      pageId: PAGE_ID,
      status: 'excluded',
      actorId: 'admin-1',
    }))
  })

  it('returns a conflict when certification blockers remain', async () => {
    state.update.mockRejectedValueOnce(new state.MarketplaceCurationError('Resolve blockers first.', 'certification_blocked'))
    const response = await PATCH(request({ pageId: PAGE_ID, status: 'certified' }))
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'certification_blocked' })
  })
})
