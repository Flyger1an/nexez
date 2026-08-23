import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../../../test/supabase-mock'

const ORDER_ID = '0839d290-1f83-4ee2-9b9e-58c79429e866'

const refs = vi.hoisted(() => ({
  auth: { user: { id: 'owner-1' } as { id: string } | null, order: { id: 'order' } as { id: string } | null },
  admin: { handler: (_context: QueryContext) => ({ data: null, error: null }) as { data?: unknown; error?: unknown } },
}))

vi.mock('../../../../../lib/server/request-auth', async () => {
  const { createSupabaseMock } = await import('../../../../../test/supabase-mock')
  return {
    resolveRequestAuth: vi.fn(async () => ({
      user: refs.auth.user,
      supabase: createSupabaseMock((context) => context.table === 'checkout_orders'
        ? { data: refs.auth.order, error: null }
        : { data: null, error: null }),
    })),
  }
})

vi.mock('../../../../../utils/supabase/admin', async () => {
  const { createSupabaseMock } = await import('../../../../../test/supabase-mock')
  return {
    hasSupabaseAdminEnv: vi.fn(() => true),
    createAdminClient: vi.fn(() => createSupabaseMock((context) => refs.admin.handler(context))),
  }
})

import { POST } from './route'

function request(status: string) {
  return new Request(`https://nexez.test/api/orders/${ORDER_ID}/fulfillment`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  })
}

describe('POST /api/orders/[id]/fulfillment', () => {
  beforeEach(() => {
    refs.auth.user = { id: 'owner-1' }
    refs.auth.order = { id: ORDER_ID }
    refs.admin.handler = (context) => context.table === 'rpc:transition_checkout_order_fulfillment'
      ? { data: { order_id: ORDER_ID, status: 'in_progress', version: 2, started_at: '2026-08-23T12:00:00.000Z', fulfilled_at: null, updated_at: '2026-08-23T12:00:00.000Z' }, error: null }
      : { data: null, error: null }
  })

  it('requires authentication', async () => {
    refs.auth.user = null
    expect((await POST(request('in_progress'), { params: Promise.resolve({ id: ORDER_ID }) })).status).toBe(401)
  })

  it('rejects invalid order ids and statuses', async () => {
    expect((await POST(request('in_progress'), { params: Promise.resolve({ id: 'bad' }) })).status).toBe(400)
    expect((await POST(request('cancelled'), { params: Promise.resolve({ id: ORDER_ID }) })).status).toBe(400)
  })

  it('returns 404 when the RLS-scoped owner read cannot see the order', async () => {
    refs.auth.order = null
    expect((await POST(request('in_progress'), { params: Promise.resolve({ id: ORDER_ID }) })).status).toBe(404)
  })

  it('passes the verified owner and actor to the atomic transition function', async () => {
    const rpcCalls: QueryContext[] = []
    refs.admin.handler = (context) => {
      if (context.table === 'rpc:transition_checkout_order_fulfillment') rpcCalls.push(context)
      return { data: { order_id: ORDER_ID, status: 'in_progress', version: 2 }, error: null }
    }

    const response = await POST(request('in_progress'), { params: Promise.resolve({ id: ORDER_ID }) })
    expect(response.status).toBe(200)
    expect(rpcCalls[0]?.payload).toEqual({
      p_order_id: ORDER_ID,
      p_owner_id: 'owner-1',
      p_status: 'in_progress',
      p_actor_user_id: 'owner-1',
    })
    expect(await response.json()).toMatchObject({ ok: true, fulfillment: { status: 'in_progress' } })
  })

  it('maps an illegal database transition to conflict', async () => {
    refs.admin.handler = () => ({ data: null, error: { code: '23514', message: 'commitment payments do not represent fulfilled work' } })
    const response = await POST(request('fulfilled'), { params: Promise.resolve({ id: ORDER_ID }) })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'commitment payments do not represent fulfilled work' })
  })
})
