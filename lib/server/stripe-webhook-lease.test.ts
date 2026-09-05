import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
const refs = vi.hoisted(() => ({ rpc: vi.fn(), configured: true }))
vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: () => refs.configured,
  createAdminClient: () => ({ rpc: refs.rpc }),
}))
import { withStripeWebhookLease } from './stripe-webhook-lease'
const event = { id: 'evt_fixture', type: 'charge.refunded', account: 'acct_fixture', data: { object: {} } } as Stripe.Event

describe('recoverable Stripe processing', () => {
  beforeEach(() => { vi.clearAllMocks(); refs.configured = true })
  it('retries after a crash following the durable receipt instead of acknowledging a duplicate', async () => {
    let state = 'received'
    refs.rpc.mockImplementation(async (name, args) => {
      if (name === 'nz_claim_stripe_event') {
        if (state === 'completed') return { data: 'completed' }
        state = 'processing'; return { data: 'claimed' }
      }
      state = args.p_error ? 'received' : 'completed'
      return { data: true }
    })
    const business = vi.fn().mockRejectedValueOnce(new Error('Crash after receipt')).mockResolvedValue(Response.json({ received: true }))
    expect((await withStripeWebhookLease(event, business)).status).toBe(503)
    expect((await withStripeWebhookLease(event, business)).status).toBe(200)
    expect(business).toHaveBeenCalledTimes(2)
    expect(await (await withStripeWebhookLease(event, business)).json()).toMatchObject({ duplicate: true })
    expect(business).toHaveBeenCalledTimes(2)
  })
  it.each(['busy', 'invalid'])('does not acknowledge or execute an event whose claim is %s', async (claim) => {
    refs.rpc.mockResolvedValue({ data: claim })
    const business = vi.fn()
    expect((await withStripeWebhookLease(event, business)).status).toBe(503)
    expect(business).not.toHaveBeenCalled()
  })
  it('fails closed if durable receipt storage is unavailable', async () => {
    refs.rpc.mockResolvedValue({ error: { code: '08006' } })
    const business = vi.fn()
    expect((await withStripeWebhookLease(event, business)).status).toBe(503)
    expect(business).not.toHaveBeenCalled()
  })
  it('uses the same fencing token to release a failed business response', async () => {
    refs.rpc.mockResolvedValueOnce({ data: 'claimed' }).mockResolvedValueOnce({ data: true })
    expect((await withStripeWebhookLease(event, async () => Response.json({ error: 'db' }, { status: 500 }))).status).toBe(500)
    const [claim, finish] = refs.rpc.mock.calls
    expect(finish![1].p_lease_token).toBe(claim![1].p_lease_token)
    expect(finish![1].p_error).toContain('HTTP 500')
  })
  it('does not acknowledge success when the lease expired before completion', async () => {
    refs.rpc.mockResolvedValueOnce({ data: 'claimed' }).mockResolvedValueOnce({ data: false })
    expect((await withStripeWebhookLease(event, async () => Response.json({ received: true }))).status).toBe(503)
  })
})
