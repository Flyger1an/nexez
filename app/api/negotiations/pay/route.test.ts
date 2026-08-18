import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { hashBearerToken } from '../../../../lib/server/bearer-token'
import type { QueryContext } from '../../../../test/supabase-mock'

const { adminRef, stripeRef } = vi.hoisted(() => ({
  adminRef: { handler: (_c: any) => ({ data: null, error: null }) as { data?: any; error?: any } },
  stripeRef: { create: (..._a: any[]) => ({}) as any, retrieve: (..._a: any[]) => ({}) as any },
}))

vi.mock('../../../../utils/supabase/admin', async () => {
  const { createSupabaseMock } = await import('../../../../test/supabase-mock')
  return {
    hasSupabaseAdminEnv: vi.fn(() => true),
    createAdminClient: vi.fn(() => createSupabaseMock((c) => adminRef.handler(c))),
  }
})
vi.mock('stripe', () => ({
  default: class {
    checkout = {
      sessions: {
        create: (...a: any[]) => stripeRef.create(...a),
        retrieve: (...a: any[]) => stripeRef.retrieve(...a),
      },
    }
  },
}))

import { POST } from './route'
import { hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

const NEG = {
  id: 'n1',
  status: 'agreement_proposed',
  amount_cents: 90000,
  settlement_state: 'auto',
  currency: 'usd',
  offer_name: 'Consult',
  owner_id: 'o1',
  status_token: 'tok',
  stripe_checkout_session_id: null,
}

function db(neg: any, billing: any = { plan_id: 'pro', status: 'active', stripe_connect_account_id: 'acct_1', stripe_connect_charges_enabled: true }) {
  let updated: any
  adminRef.handler = (ctx: QueryContext) => {
    if (ctx.table === 'agent_negotiations' && ctx.op === 'select') {
      // honor the id+token scoping the route applies
      if (neg && ctx.eqs.id === neg.id && ctx.eqs.status_token_sha256 === hashBearerToken(neg.status_token)) return { data: neg }
      return { data: null }
    }
    if (ctx.table === 'agent_negotiations' && ctx.op === 'update') {
      updated = ctx.payload
      return { data: null, error: null }
    }
    if (ctx.table === 'billing_subscriptions') return { data: billing }
    return { data: null, error: null }
  }
  return () => updated
}

const post = (body: unknown) =>
  new Request('https://nexez.test/api/negotiations/pay', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/negotiations/pay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x')
    stripeRef.create = vi.fn(async () => ({ id: 'cs_new', url: 'https://pay/cs_new', status: 'open' }))
    stripeRef.retrieve = vi.fn(async (id: string) => ({
      id,
      url: `https://pay/${id}`,
      status: 'open',
      amount_total: 90000,
      currency: 'usd',
      metadata: { nexez_payment_fingerprint: '90000:usd:auto:acct_1:4500' },
    }))
  })
  afterEach(() => vi.unstubAllEnvs())

  it('412 when Stripe is not enabled', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    expect((await POST(post({ negotiationId: 'n1', token: 'tok' }))).status).toBe(412)
  })

  it('constant 404 on id/token mismatch', async () => {
    db(NEG)
    const res = await POST(post({ negotiationId: 'n1', token: 'wrong' }))
    expect(res.status).toBe(404)
  })

  it('409 when not awaiting payment', async () => {
    db({ ...NEG, status: 'negotiation' })
    expect((await POST(post({ negotiationId: 'n1', token: 'tok' }))).status).toBe(409)
  })

  it('409 when high-value agreement is awaiting owner approval', async () => {
    db({ ...NEG, settlement_state: 'awaiting_approval' })
    const res = await POST(post({ negotiationId: 'n1', token: 'tok' }))
    expect(res.status).toBe(409)
    expect((await res.json()).settlementState).toBe('awaiting_approval')
  })

  it('auto: immediate capture, settlement metadata "auto", Connect app fee + url', async () => {
    const getUpdate = db(NEG)
    const res = await POST(post({ negotiationId: 'n1', token: 'tok' }))
    expect(res.status).toBe(200)
    expect((await res.json()).url).toBe('https://pay/cs_new')
    const [params, opts] = (stripeRef.create as any).mock.calls[0]
    expect(params.payment_intent_data.capture_method).toBe('automatic')
    expect(params.metadata.nexez_settlement).toBe('auto')
    expect(params.metadata.nexez_negotiation_id).toBe('n1')
    // 5% Pro commission on $900 = $45
    expect(params.payment_intent_data.application_fee_amount).toBe(4500)
    expect(params.metadata).toMatchObject({
      nexez_owner_plan: 'pro',
      nexez_commission_bps: '500',
      nexez_commission_percent: '5',
      nexez_commission_source: 'plan_default',
    })
    expect(getUpdate()).toMatchObject({
      commission_bps: 500,
      commission_percent: 5,
      application_fee_cents: 4500,
      plan_id_at_purchase: 'pro',
      commission_source: 'plan_default',
    })
    expect(opts.stripeAccount).toBe('acct_1')
    expect(opts.idempotencyKey).toBe('escrow-n1-90000:usd:auto:acct_1:4500')
  })

  it('zero-decimal currency: charges Stripe smallest unit, not amount_cents (JPY 100x bug)', async () => {
    // amount_cents is stored as major×100 (¥1,000 → 100000); JPY is zero-decimal so
    // Stripe must be charged 1000, not 100000, and the app fee scales with it.
    db({ ...NEG, currency: 'jpy', amount_cents: 100000 })
    const res = await POST(post({ negotiationId: 'n1', token: 'tok' }))
    expect(res.status).toBe(200)
    const [params, opts] = (stripeRef.create as any).mock.calls[0]
    expect(params.line_items[0].price_data.currency).toBe('jpy')
    expect(params.line_items[0].price_data.unit_amount).toBe(1000) // ¥1,000, not ¥100,000
    expect(params.payment_intent_data.application_fee_amount).toBe(50) // 5% of ¥1,000
    expect(opts.idempotencyKey).toBe('escrow-n1-1000:jpy:auto:acct_1:50')
  })

  it('canceled "pro" subscription reverts to Free 9% commission (status-aware, not raw plan_id)', async () => {
    // A {plan_id:'pro', status:'canceled'} row must NOT keep the 5% rate - commission
    // is resolved via getOwnerPlanId (live-status only), same as entitlements.
    db(NEG, { plan_id: 'pro', status: 'canceled', stripe_connect_account_id: 'acct_1', stripe_connect_charges_enabled: true })
    const res = await POST(post({ negotiationId: 'n1', token: 'tok' }))
    expect(res.status).toBe(200)
    const [params] = (stripeRef.create as any).mock.calls[0]
    // canceled pro → free → 9% of $900 = $81
    expect(params.payment_intent_data.application_fee_amount).toBe(8100)
  })

  it.each([
    ['free', 900, 8100],
    ['launch', 700, 6300],
    ['pro', 500, 4500],
    ['scale', 300, 2700],
    ['enterprise', 200, 1800],
  ])('snapshots the %s plan economics on negotiation funding', async (planId, commissionBps, expectedFee) => {
    const getUpdate = db(NEG, { plan_id: planId, status: 'active', stripe_connect_account_id: 'acct_1', stripe_connect_charges_enabled: true })
    expect((await POST(post({ negotiationId: 'n1', token: 'tok' }))).status).toBe(200)
    const [params] = (stripeRef.create as any).mock.calls[0]
    expect(params.payment_intent_data.application_fee_amount).toBe(expectedFee)
    expect(params.metadata).toMatchObject({
      nexez_owner_plan: planId,
      nexez_commission_bps: String(commissionBps),
      nexez_commission_source: 'plan_default',
      nexez_application_fee_cents: String(expectedFee),
    })
    expect(getUpdate()).toMatchObject({
      commission_bps: commissionBps,
      application_fee_cents: expectedFee,
      plan_id_at_purchase: planId,
      commission_source: 'plan_default',
    })
  })

  it('409 owner_not_connected when the seller has no Stripe Connect account (no platform-account charge)', async () => {
    db(NEG, { plan_id: 'pro', status: 'active', stripe_connect_account_id: null })
    const res = await POST(post({ negotiationId: 'n1', token: 'tok' }))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('owner_not_connected')
    expect(stripeRef.create).not.toHaveBeenCalled()
  })

  it('409 owner_not_connected when the Connect account exists but charges are NOT enabled (mid-onboarding)', async () => {
    db(NEG, { plan_id: 'pro', status: 'active', stripe_connect_account_id: 'acct_1', stripe_connect_charges_enabled: false })
    const res = await POST(post({ negotiationId: 'n1', token: 'tok' }))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('owner_not_connected')
    expect(stripeRef.create).not.toHaveBeenCalled()
  })

  it('funds through the Free fallback when a no-card trial has expired', async () => {
    // Billing expiry no longer suppresses a business. A connected seller remains
    // payable at the Free commission rate while their paid-plan trial is inactive.
    db(NEG, { plan_id: 'pro', status: 'paused', account_origin: 'trial', stripe_connect_account_id: 'acct_1', stripe_connect_charges_enabled: true })
    const res = await POST(post({ negotiationId: 'n1', token: 'tok' }))
    expect(res.status).toBe(200)
    const [params] = (stripeRef.create as any).mock.calls[0]
    expect(params.payment_intent_data.application_fee_amount).toBe(8100)
  })

  it('approved (high value): manual-capture hold, metadata "hold"', async () => {
    db({ ...NEG, settlement_state: 'approved', amount_cents: 500000 })
    const res = await POST(post({ negotiationId: 'n1', token: 'tok' }))
    expect(res.status).toBe(200)
    const [params] = (stripeRef.create as any).mock.calls[0]
    expect(params.payment_intent_data.capture_method).toBe('manual')
    expect(params.metadata.nexez_settlement).toBe('hold')
  })

  it('idempotent: reuses a still-open session instead of creating a new one', async () => {
    db({ ...NEG, stripe_checkout_session_id: 'cs_existing' })
    const res = await POST(post({ negotiationId: 'n1', token: 'tok' }))
    expect(res.status).toBe(200)
    expect((await res.json())).toMatchObject({ reused: true, url: 'https://pay/cs_existing' })
    expect((stripeRef.create as any)).not.toHaveBeenCalled()
  })

  it('keeps an open session immutable when only the owner commission changed', async () => {
    stripeRef.retrieve = vi.fn(async (id: string) => ({
      id,
      url: `https://pay/${id}`,
      status: 'open',
      amount_total: 90000,
      currency: 'usd',
      metadata: { nexez_payment_fingerprint: '90000:usd:auto:acct_1:8100' },
    }))
    db({ ...NEG, stripe_checkout_session_id: 'cs_existing' })
    const res = await POST(post({ negotiationId: 'n1', token: 'tok' }))
    expect(await res.json()).toMatchObject({ reused: true, sessionId: 'cs_existing' })
    expect(stripeRef.create).not.toHaveBeenCalled()
  })

  it('does not reuse an open session when money terms changed', async () => {
    db({ ...NEG, amount_cents: 120000, stripe_checkout_session_id: 'cs_existing' })
    const res = await POST(post({ negotiationId: 'n1', token: 'tok' }))
    expect(res.status).toBe(200)
    expect((await res.json())).toMatchObject({ sessionId: 'cs_new' })
    expect((stripeRef.create as any)).toHaveBeenCalledTimes(1)
  })
})
