import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock } from '../../../../test/supabase-mock'
const refs = vi.hoisted(() => ({ user: { id: 'owner-1' } as { id: string } | null,
  order: { id: 'o1', currency: 'usd' } as any, configured: true, execute: vi.fn() }))
vi.mock('../../../../lib/server/request-auth', () => ({
  resolveRequestAuth: async () => ({ user: refs.user, supabase: createSupabaseMock(() => ({ data: refs.order })) }),
}))
vi.mock('../../../../utils/supabase/admin', () => ({ hasSupabaseAdminEnv: () => refs.configured }))
vi.mock('../../../../lib/rate-limit', () => ({ enforceRateLimit: async () => null }))
vi.mock('../../../../lib/server/refund-operation', async (original) => ({ ...await original<any>(), executeRefund: refs.execute }))
import { POST } from './route'
const operationId = '75000000-0000-4000-8000-000000000001'
const post = (body: unknown) => new Request('https://nexez.test/api/orders/refund', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})
describe('direct refund authorization and operation binding', () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture')
    refs.user = { id: 'owner-1' }; refs.order = { id: 'o1', currency: 'usd' }; refs.configured = true
    refs.execute.mockResolvedValue(Response.json({ ok: true, operationId }))
  })
  afterEach(() => vi.unstubAllEnvs())
  it('fails before processing when Stripe or durable storage is unavailable', async () => {
    refs.configured = false
    expect((await POST(post({ orderId: 'o1', operationId }))).status).toBe(503)
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    expect((await POST(post({ orderId: 'o1', operationId }))).status).toBe(412)
    expect(refs.execute).not.toHaveBeenCalled()
  })
  it('requires an authenticated owner and an RLS-visible order', async () => {
    refs.user = null
    expect((await POST(post({ orderId: 'o1', operationId }))).status).toBe(401)
    refs.user = { id: 'owner-1' }; refs.order = null
    expect((await POST(post({ orderId: 'o1', operationId }))).status).toBe(404)
    expect(refs.execute).not.toHaveBeenCalled()
  })
  it.each([undefined, 'old-running-total', '../operation'])('rejects an absent or invalid stable operation ID: %s', async (id) => {
    expect((await POST(post({ orderId: 'o1', operationId: id }))).status).toBe(400)
    expect(refs.execute).not.toHaveBeenCalled()
  })
  it.each([0, -1, '20'])('rejects invalid partial amount %s', async (amount) => {
    expect((await POST(post({ orderId: 'o1', operationId, amount }))).status).toBe(400)
    expect(refs.execute).not.toHaveBeenCalled()
  })
  it('binds the operation to the authenticated owner and recorded currency', async () => {
    expect((await POST(post({ orderId: 'o1', operationId, amount: 20, ownerId: 'foreign', currency: 'jpy' }))).status).toBe(200)
    expect(refs.execute).toHaveBeenCalledWith({ operationId, ownerId: 'owner-1', kind: 'order', targetId: 'o1', currency: 'usd', amount: 20 })
  })
  it('lets the durable operation resolve a full-refund replay after the order becomes terminal', async () => {
    refs.order.status = 'refunded'
    expect((await POST(post({ orderId: 'o1', operationId }))).status).toBe(200)
    expect(refs.execute).toHaveBeenCalled()
  })
  it('returns the durable operation conflict without making a second request', async () => {
    refs.execute.mockResolvedValue(Response.json({ error: 'Operation mismatch' }, { status: 409 }))
    expect((await POST(post({ orderId: 'o1', operationId, amount: 30 }))).status).toBe(409)
    expect(refs.execute).toHaveBeenCalledTimes(1)
  })
})
