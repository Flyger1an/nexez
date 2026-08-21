import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueryContext } from '../../../test/supabase-mock'

const { handlerRef } = vi.hoisted(() => ({
  handlerRef: {
    handler: (_context: QueryContext) => ({ data: null, error: null }) as { data?: unknown; error?: { message: string; code?: string } | null },
  },
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: vi.fn() })) }))
vi.mock('../../../utils/supabase/server', async () => {
  const { createSupabaseMock } = await import('../../../test/supabase-mock')
  return {
    createClient: vi.fn(() => createSupabaseMock((context) => handlerRef.handler(context), {
      user: { id: 'owner-1', email: 'owner@example.test' },
    })),
  }
})

import { GET, POST } from './route'

const PAGE = '11111111-1111-4111-8111-111111111111'
const POOL = '22222222-2222-4222-8222-222222222222'

function post(body: unknown) {
  return new Request('https://nexez.test/api/resource-pools', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('/api/resource-pools owner authoring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    handlerRef.handler = (context) => {
      if (context.table === 'resource_pools' && context.op === 'insert') {
        return { data: { id: POOL, ...context.payload, version: 1 }, error: null }
      }
      if (context.table === 'resource_pool_windows' && context.op === 'insert') {
        return { data: { id: '33333333-3333-4333-8333-333333333333', ...context.payload, version: 1 }, error: null }
      }
      if (context.table === 'resource_pools') return { data: [{ id: POOL, page_id: PAGE }], error: null }
      if (context.table === 'resource_pool_windows') return { data: [{ id: 'window-1', pool_id: POOL }], error: null }
      return { data: null, error: null }
    }
  })

  it('persists an owner-authored pool with owner identity supplied by the session', async () => {
    const response = await POST(post({
      type: 'pool',
      pageId: PAGE,
      pool: { resourceKey: 'guest-capacity', label: 'Guest capacity', unitLabel: 'guests', kind: 'reusable', totalQuantity: 60 },
    }))
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      ok: true,
      pool: { owner_id: 'owner-1', page_id: PAGE, resource_key: 'guest-capacity', kind: 'reusable', total_quantity: 60 },
    })
  })

  it('persists an explicit reusable availability window', async () => {
    const response = await POST(post({
      type: 'window',
      poolId: POOL,
      window: {
        windowKey: 'dinner-evening',
        label: 'Dinner evening',
        startsAt: '2030-09-03T18:00:00Z',
        endsAt: '2030-09-03T23:00:00Z',
        totalQuantity: 40,
      },
    }))
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      ok: true,
      window: { pool_id: POOL, window_key: 'dinner-evening', total_quantity: 40 },
    })
  })

  it('lists only records visible through the signed-in owner RLS session', async () => {
    const response = await GET(new Request(`https://nexez.test/api/resource-pools?pageId=${PAGE}`))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      pools: [{ id: POOL, page_id: PAGE }],
      windows: [{ id: 'window-1', pool_id: POOL }],
    })
  })

  it('rejects unsafe merchant data before persistence', async () => {
    const response = await POST(post({
      type: 'pool',
      pageId: PAGE,
      pool: { resourceKey: 'bad key', label: '<script>', unitLabel: 'units', kind: 'external', totalQuantity: -1 },
    }))
    expect(response.status).toBe(400)
  })
})
