import { beforeEach, describe, expect, it, vi } from 'vitest'

const refs = vi.hoisted(() => ({
  user: null as { id: string } | null,
  load: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })),
}))
vi.mock('../../../../utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: refs.user } })) },
  })),
}))
vi.mock('../../../../lib/server/dashboard-commerce-actions', () => ({
  loadDashboardCommerceActions: refs.load,
}))

import { GET } from './route'

describe('GET /api/dashboard/commerce-attention', () => {
  beforeEach(() => {
    refs.user = { id: 'owner-1' }
    refs.load.mockReset()
  })

  it('requires an authenticated dashboard owner', async () => {
    refs.user = null
    const response = await GET()

    expect(response.status).toBe(401)
    expect(refs.load).not.toHaveBeenCalled()
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('returns an owner-scoped exact action summary', async () => {
    refs.load.mockResolvedValue({
      actions: [{
        record: { href: '/dashboard/orders/order-1' },
      }],
      urgentCount: 0,
      isTruncated: false,
      issues: [],
    })

    const response = await GET()
    const body = await response.json()

    expect(refs.load).toHaveBeenCalledWith(expect.anything(), 'owner-1')
    expect(body.attention).toEqual({
      visibleCount: 1,
      urgentCount: 0,
      isTruncated: false,
      status: 'complete',
      href: '/dashboard/orders/order-1',
    })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('reports unavailable evidence instead of returning a false zero-action state', async () => {
    refs.load.mockResolvedValue({
      actions: [],
      urgentCount: 0,
      isTruncated: false,
      issues: ['Buyer requests could not be checked.'],
    })

    const response = await GET()
    const body = await response.json()

    expect(body.attention).toMatchObject({
      visibleCount: 0,
      status: 'unavailable',
      href: '/dashboard/commerce',
    })
  })
})
