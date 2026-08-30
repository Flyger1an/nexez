import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueryContext } from '../../../../test/supabase-mock'

const { adminRef, stripeCalls } = vi.hoisted(() => ({
  adminRef: {
    handler: (_context: QueryContext) => ({ data: null, error: null }) as { data?: unknown; error?: { message: string; code?: string } | null },
  },
  stripeCalls: [] as Array<{ params: any; options: any }>,
}))

vi.mock('stripe', () => ({
  default: class {
    checkout = {
      sessions: {
        create: async (params: any, options: any) => {
          stripeCalls.push({ params, options })
          return { id: 'cs_staged_1', url: 'https://stripe.test/cs_staged_1', status: 'open', livemode: false }
        },
        retrieve: async () => ({ id: 'cs_staged_1', url: 'https://stripe.test/cs_staged_1', status: 'open' }),
        expire: async () => ({ id: 'cs_staged_1', status: 'expired' }),
      },
    }
  },
}))

vi.mock('../../../../utils/supabase/admin', async () => {
  const { createSupabaseMock } = await import('../../../../test/supabase-mock')
  return {
    hasSupabaseAdminEnv: vi.fn(() => true),
    createAdminClient: vi.fn(() => createSupabaseMock((context) => adminRef.handler(context))),
  }
})

vi.mock('../../../../lib/commerce/settlement-bridge', () => ({
  resolveSettlementContext: vi.fn(async () => ({
    ok: true,
    context: {
      connectAccountId: 'acct_staged_1',
      commissionBps: 500,
      commissionPercent: 5,
      commissionSource: 'plan_default',
      planId: 'free',
    },
  })),
}))

import { POST } from './route'

function stagedPage() {
  return {
    id: 'page-staged-1',
    owner_id: 'owner-staged-1',
    slug: 'staged-design',
    name: 'Staged Design',
    currency: 'usd',
    services: [{
      name: 'Website Project',
      price: '$100',
      description: 'A finite project.',
      url: '',
      stagedSettlementTerms: {
        schemaVersion: 1,
        paymentModel: 'staged-fixed-total',
        approvalPolicy: 'buyer-approves-each-stage',
        mutationPolicy: 'immutable-after-first-payment',
        stages: [
          { id: 'deposit', label: 'Booking installment', kind: 'commitment', allocationBps: 3000 },
          { id: 'completion', label: 'Completion payment', kind: 'completion', allocationBps: 7000 },
        ],
      },
    }],
    products: [],
    is_published: true,
  }
}

function request(body: unknown, idempotencyKey?: string) {
  return new Request('https://nexez.test/api/staged-settlements/checkout', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/staged-settlements/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stripeCalls.length = 0
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_staged')
    vi.stubEnv('INTEGRATION_SECRET_KEY', '1'.repeat(64))
    vi.stubEnv('NEXEZ_ACTION_APPROVAL_SECRET', 'staged-approval-secret-at-least-32-characters')
    adminRef.handler = (context) => {
      if (context.table === 'pages') return { data: stagedPage(), error: null }
      if (context.table === 'staged_settlement_agreements' && context.op === 'select') return { data: null, error: null }
      if (context.table === 'staged_settlement_agreements' && context.op === 'insert') return { data: null, error: null }
      if (context.table === 'staged_settlement_obligations' && context.op === 'insert') {
        return {
          data: [
            { id: 'obligation-deposit', stage_order: 1 },
            { id: 'obligation-completion', stage_order: 2 },
          ],
          error: null,
        }
      }
      if (context.table === 'staged_settlement_obligations' && context.op === 'update') {
        return { data: { id: 'obligation-deposit' }, error: null }
      }
      return { data: null, error: null }
    }
  })

  afterEach(() => vi.unstubAllEnvs())

  it('previews the exact first installment without calling Stripe', async () => {
    const response = await POST(request({ slug: 'staged-design', offer: 'services-0', dryRun: true }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      provider: 'stripe_staged_settlement',
      amountCents: 3000,
      agreedTotalCents: 10_000,
      currentObligation: { id: 'deposit', amountCents: 3000, order: 1 },
      approvalTokenRequired: true,
    })
    expect(body.approvalToken).toMatch(/^v1\./)
    expect(body.stagedSettlementContractFingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(stripeCalls).toHaveLength(0)
  })

  it('requires duplicate protection for every live staged payment', async () => {
    const preview = await POST(request({ slug: 'staged-design', offer: 'services-0', dryRun: true }))
    const { approvalToken } = await preview.json()
    const response = await POST(request({ slug: 'staged-design', offer: 'services-0', approvalToken }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'idempotency_key_required' })
    expect(stripeCalls).toHaveLength(0)
  })

  it('charges only the approved first obligation and fingerprints its provenance', async () => {
    const preview = await POST(request({ slug: 'staged-design', offer: 'services-0', buyerAgent: 'Nexxi', dryRun: true }))
    const { approvalToken } = await preview.json()
    const response = await POST(request(
      { slug: 'staged-design', offer: 'services-0', buyerAgent: 'Nexxi', approvalToken },
      'staged-checkout-test-key-0001',
    ))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      checkoutSessionId: 'cs_staged_1',
      currentObligation: { id: 'deposit', amountCents: 3000 },
      remainingAmountCents: 7000,
    })
    expect(body.stagedSettlementAccessToken).toMatch(/^[a-f0-9]{64}$/)
    expect(stripeCalls).toHaveLength(1)
    const [{ params, options }] = stripeCalls
    expect(params.mode).toBe('payment')
    expect(params.line_items[0].price_data.unit_amount).toBe(3000)
    expect(params.payment_intent_data.application_fee_amount).toBe(150)
    expect(params.success_url).toBe('https://nexez.test/nexxi/checkout/return?status=success&session_id={CHECKOUT_SESSION_ID}')
    expect(params.cancel_url).toBe('https://nexez.test/nexxi/checkout/return?status=cancelled')
    expect(params.origin_context).toBe('mobile_app')
    expect(params.metadata.nexez_kind).toBe('staged_settlement')
    expect(params.payment_intent_data.metadata).toMatchObject({
      nexez_kind: 'staged_settlement',
      nexez_staged_obligation_id: 'obligation-deposit',
      nexez_staged_stage_id: 'deposit',
    })
    expect(params.metadata.nexez_staged_contract_fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(params.metadata.nexez_staged_approval_fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(options).toMatchObject({ stripeAccount: 'acct_staged_1' })
    expect(options.idempotencyKey).toMatch(/^nexez_staged_[a-f0-9]{64}$/)
  })

  it('invalidates approval when the merchant changes the schedule', async () => {
    const preview = await POST(request({ slug: 'staged-design', offer: 'services-0', dryRun: true }))
    const { approvalToken } = await preview.json()
    const changed = stagedPage()
    changed.services[0].stagedSettlementTerms.stages[0].allocationBps = 4000
    changed.services[0].stagedSettlementTerms.stages[1].allocationBps = 6000
    adminRef.handler = (context) => context.table === 'pages'
      ? { data: changed, error: null }
      : { data: null, error: null }

    const response = await POST(request(
      { slug: 'staged-design', offer: 'services-0', approvalToken },
      'staged-checkout-test-key-0002',
    ))
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'approval_invalid' })
    expect(stripeCalls).toHaveLength(0)
  })
})
