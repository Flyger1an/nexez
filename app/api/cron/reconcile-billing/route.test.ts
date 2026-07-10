import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../../test/supabase-mock'

const { subscriptionsList } = vi.hoisted(() => ({ subscriptionsList: vi.fn() }))
vi.mock('stripe', () => ({ default: class { subscriptions = { list: subscriptionsList } } }))
vi.mock('../../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => true),
  createAdminClient: vi.fn(),
}))
vi.mock('../../../../lib/observability', () => ({ captureError: vi.fn() }))

import { GET } from './route'
import { createAdminClient } from '../../../../utils/supabase/admin'

const cronReq = () => new Request('https://nexez.test/api/cron/reconcile-billing')

describe('GET /api/cron/reconcile-billing — trial-expiry pause pass', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_ready')
    subscriptionsList.mockResolvedValue({ data: [] })
  })
  afterEach(() => vi.unstubAllEnvs())

  it('pauses an expired no-card trial that carries a lingering stripe_customer_id (abandoned payment sheet), and does NOT filter that row out', async () => {
    const updates: Array<{ payload: any; eqs: Record<string, any> }> = []
    let expirySelectCalls: QueryContext['calls'] = []

    vi.mocked(createAdminClient).mockReturnValue(
      createSupabaseMock((ctx) => {
        if (ctx.op === 'update') {
          updates.push({ payload: ctx.payload, eqs: { ...ctx.eqs } })
          return { error: null }
        }
        // A SELECT: the main Stripe-reconcile pass is the one that calls .not(); return
        // nothing there so the test isolates the expiry pass.
        const isMainLoop = ctx.calls.some((c) => c[0] === 'not')
        if (isMainLoop) return { data: [] }
        expirySelectCalls = ctx.calls
        // The expired trial that opened + abandoned the payment sheet: still 'trialing'
        // but now carries a customer id. The regression let this row serve forever.
        return { data: [{ owner_id: 'trial-owner-1' }] }
      }) as any,
    )

    const res = await GET(cronReq())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.pausedTrials).toBe(1)

    // The row WAS paused, guarded so a just-landed conversion ('active') is never clobbered.
    expect(updates).toHaveLength(1)
    expect(updates[0].payload).toEqual({ status: 'paused' })
    expect(updates[0].eqs).toEqual({ owner_id: 'trial-owner-1', status: 'trialing' })

    // The expiry query scopes to expired no-card trials ONLY — and must NOT re-add the
    // stale `.is('stripe_customer_id', null)` proxy that excluded abandoned-sheet trials.
    expect(expirySelectCalls).toContainEqual(['eq', 'account_origin', 'trial'])
    expect(expirySelectCalls).toContainEqual(['eq', 'status', 'trialing'])
    expect(expirySelectCalls.some((c) => c[0] === 'lt' && c[1] === 'trial_ends_at')).toBe(true)
    expect(expirySelectCalls.some((c) => c[0] === 'is' && c[1] === 'stripe_customer_id')).toBe(false)
  })

  it('leaves a still-paused row alone in the main loop (no live sub, db-managed, no subscription id)', async () => {
    const updates: Array<{ payload: any; eqs: Record<string, any> }> = []
    vi.mocked(createAdminClient).mockReturnValue(
      createSupabaseMock((ctx) => {
        if (ctx.op === 'update') {
          updates.push({ payload: ctx.payload, eqs: { ...ctx.eqs } })
          return { error: null }
        }
        const isMainLoop = ctx.calls.some((c) => c[0] === 'not')
        if (isMainLoop) {
          return { data: [{ owner_id: 'paused-1', stripe_customer_id: 'cus_x', stripe_subscription_id: null, plan_id: null, status: 'paused' }] }
        }
        return { data: [] } // no expired trials this run
      }) as any,
    )
    // Customer's only Stripe sub is an abandoned incomplete one — never "live".
    subscriptionsList.mockResolvedValue({ data: [{ id: 'sub_dead', status: 'incomplete_expired', items: { data: [] } }] })

    const res = await GET(cronReq())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.pausedTrials).toBe(0)
    // The paused row must not be healed to 'canceled' or reactivated. The only write is
    // the fair-rotation cursor stamp proving this row was inspected.
    expect(updates).toHaveLength(1)
    expect(updates[0].payload).toEqual({ last_reconciled_at: expect.any(String) })
    expect(body.unchanged).toBe(1)
  })

  it('does NOT null an active subscriber plan when the Stripe price is unmapped — uses the metadata fallback (webhook parity)', async () => {
    const upserts: any[] = []
    vi.mocked(createAdminClient).mockReturnValue(
      createSupabaseMock((ctx) => {
        if (ctx.op === 'upsert') {
          upserts.push(ctx.payload)
          return { error: null }
        }
        const isMainLoop = ctx.calls.some((c) => c[0] === 'not')
        if (isMainLoop) {
          return { data: [{ owner_id: 'sub-owner', stripe_customer_id: 'cus_x', stripe_subscription_id: 'sub1', plan_id: 'pro', status: 'active' }] }
        }
        return { data: [] } // no expired trials
      }) as any,
    )
    // Live active sub, but its price id maps to NO local plan (a plan Price-ID env drift).
    // metadata still carries the plan chosen at creation.
    subscriptionsList.mockResolvedValue({
      data: [{
        id: 'sub1', status: 'active', customer: 'cus_x',
        metadata: { nexez_plan: 'pro', nexez_price_id: 'price_pro_drifted' },
        cancel_at_period_end: false,
        items: { data: [{ id: 'si_1', price: { id: 'price_unmapped_env' }, current_period_start: 1, current_period_end: 2 }] },
      }],
    })

    const res = await GET(cronReq())
    const body = await res.json()

    expect(res.status).toBe(200)
    // Rebuilt plan_id resolves to 'pro' via the metadata fallback (not null), matching the
    // row → treated as unchanged, NO plan-nulling upsert. Without the fallback this would
    // have upserted plan_id=null (entitlement dropped, commission spiked to 15%) hourly.
    expect(body.unchanged).toBe(1)
    expect(upserts.every((p) => p.plan_id !== null)).toBe(true)
  })

  it('orders by the oldest reconciliation cursor and stamps every scanned row', async () => {
    const mainSelectCalls: QueryContext['calls'][] = []
    const cursorWrites: any[] = []
    vi.mocked(createAdminClient).mockReturnValue(
      createSupabaseMock((ctx) => {
        if (ctx.op === 'update') {
          if ('last_reconciled_at' in ctx.payload) cursorWrites.push({ owner: ctx.eqs.owner_id, value: ctx.payload.last_reconciled_at })
          return { error: null }
        }
        const isMainLoop = ctx.calls.some((c) => c[0] === 'not')
        if (isMainLoop) {
          mainSelectCalls.push(ctx.calls)
          return {
            data: [
              { owner_id: 'owner-a', stripe_customer_id: 'cus_a', stripe_subscription_id: null, plan_id: null, status: 'canceled', last_reconciled_at: null },
              { owner_id: 'owner-b', stripe_customer_id: 'cus_b', stripe_subscription_id: null, plan_id: null, status: 'canceled', last_reconciled_at: '2026-07-01T00:00:00Z' },
            ],
          }
        }
        return { data: [] }
      }) as any,
    )
    subscriptionsList.mockResolvedValue({ data: [] })

    const res = await GET(cronReq())

    expect(res.status).toBe(200)
    expect(mainSelectCalls[0]).toContainEqual(['order', 'last_reconciled_at', { ascending: true, nullsFirst: true }])
    expect(mainSelectCalls[0]).toContainEqual(['order', 'owner_id', { ascending: true }])
    expect(cursorWrites.map((write) => write.owner)).toEqual(['owner-a', 'owner-b'])
    expect(cursorWrites[0].value).toBe(cursorWrites[1].value)
  })
})
