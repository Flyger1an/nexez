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
    // The paused row must be left exactly as-is — NOT healed to 'canceled', NOT reactivated.
    expect(updates).toHaveLength(0)
    expect(body.unchanged).toBe(1)
  })
})
