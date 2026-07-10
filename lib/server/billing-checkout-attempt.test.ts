import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock } from '../../test/supabase-mock'

vi.mock('../../utils/supabase/admin', () => ({
  createAdminClient: vi.fn(),
  hasSupabaseAdminEnv: vi.fn(),
}))

import {
  claimBillingCheckoutAttempt,
  retireSupersededBillingObject,
  stripeBillingIdempotencyKey,
} from './billing-checkout-attempt'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'

function drive(initial: any = null) {
  let row = initial
  const admin = createSupabaseMock((ctx) => {
    if (ctx.table !== 'billing_checkout_attempts') return { data: null, error: null }
    if (ctx.op === 'insert') {
      if (row) return { data: null, error: { code: '23505' } }
      row = { ...ctx.payload }
      return { data: row, error: null }
    }
    if (ctx.op === 'update') {
      const cutoff = ctx.calls.find((call) => call[0] === 'lte' && call[1] === 'expires_at')?.[2]
      if (cutoff && Date.parse(row.expires_at) > Date.parse(cutoff)) return { data: null, error: null }
      row = { ...row, ...ctx.payload }
      return { data: row, error: null }
    }
    return { data: row, error: null }
  })
  vi.mocked(createAdminClient).mockReturnValue(admin as any)
  return { get row() { return row } }
}

describe('billing checkout attempt claims', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
  })

  it('reuses the same operation key for a same-plan retry', async () => {
    drive()
    const now = new Date('2026-07-10T12:00:00.000Z')

    const first = await claimBillingCheckoutAttempt({ ownerId: 'owner-1', planId: 'pro', flow: 'embedded', now })
    const second = await claimBillingCheckoutAttempt({ ownerId: 'owner-1', planId: 'pro', flow: 'embedded', now })

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) throw new Error('claim unexpectedly failed')
    expect(second.reused).toBe(true)
    expect(second.attempt.attempt_key).toBe(first.attempt.attempt_key)
  })

  it('fails closed when a competing plan or checkout flow is active', async () => {
    drive()
    const now = new Date('2026-07-10T12:00:00.000Z')
    await claimBillingCheckoutAttempt({ ownerId: 'owner-1', planId: 'pro', flow: 'embedded', now })

    expect(await claimBillingCheckoutAttempt({ ownerId: 'owner-1', planId: 'scale', flow: 'embedded', now }))
      .toEqual({ ok: false, reason: 'busy' })
    expect(await claimBillingCheckoutAttempt({ ownerId: 'owner-1', planId: 'pro', flow: 'hosted', now }))
      .toEqual({ ok: false, reason: 'busy' })
  })

  it('replaces an expired claim and returns the stale Stripe object for cleanup', async () => {
    const state = drive({
      owner_id: 'owner-1',
      attempt_key: 'old-attempt',
      plan_id: 'launch',
      flow: 'hosted',
      state: 'ready',
      stripe_object_id: 'cs_old',
      expires_at: '2026-07-10T11:00:00.000Z',
    })

    const result = await claimBillingCheckoutAttempt({
      ownerId: 'owner-1',
      planId: 'scale',
      flow: 'embedded',
      now: new Date('2026-07-10T12:00:00.000Z'),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('claim unexpectedly failed')
    expect(result.reused).toBe(false)
    expect(result.superseded).toEqual({ flow: 'hosted', stripe_object_id: 'cs_old' })
    expect(state.row.plan_id).toBe('scale')
    expect(state.row.attempt_key).not.toBe('old-attempt')
  })

  it('builds short, operation-scoped Stripe idempotency keys', () => {
    const key = stripeBillingIdempotencyKey('f8dcbfaf-7f62-43b8-852b-8ad3d3637257', 'subscription-create')
    expect(key).toBe('nexez-billing:subscription-create:f8dcbfaf-7f62-43b8-852b-8ad3d3637257')
    expect(key.length).toBeLessThanOrEqual(255)
  })

  it('preserves a subscription that became active before its claim expired', async () => {
    const retrieve = vi.fn(async () => ({ status: 'active' }))
    const cancel = vi.fn(async () => ({}))
    const stripe = {
      checkout: { sessions: { expire: vi.fn(async () => ({})) } },
      subscriptions: { retrieve, cancel },
    }

    await expect(retireSupersededBillingObject(stripe, 'sub_paid')).resolves.toBe('preserved')
    expect(retrieve).toHaveBeenCalledWith('sub_paid')
    expect(cancel).not.toHaveBeenCalled()
  })

  it('cancels only a genuinely incomplete superseded subscription', async () => {
    const cancel = vi.fn(async () => ({}))
    const stripe = {
      checkout: { sessions: { expire: vi.fn(async () => ({})) } },
      subscriptions: { retrieve: vi.fn(async () => ({ status: 'incomplete' })), cancel },
    }

    await expect(retireSupersededBillingObject(stripe, 'sub_abandoned')).resolves.toBe('canceled')
    expect(cancel).toHaveBeenCalledWith('sub_abandoned')
  })
})
