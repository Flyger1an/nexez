import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueryContext } from '../../../../test/supabase-mock'

const { adminRef, stripeCalls } = vi.hoisted(() => ({
  adminRef: {
    handler: (_c: QueryContext) => ({ data: null, error: null }) as { data?: unknown; error?: { message: string; code?: string } | null },
  },
  stripeCalls: [] as Array<{ params: any; opts: any }>,
}))

vi.mock('stripe', () => ({
  default: class {
    checkout = {
      sessions: {
        create: async (params: any, opts: any) => {
          stripeCalls.push({ params, opts })
          return { id: 'cs_recurring_fulfillment', url: 'https://stripe.test/cs_recurring_fulfillment', status: 'open', livemode: false }
        },
        retrieve: async () => ({ id: 'cs_recurring_fulfillment', url: 'https://stripe.test/cs_recurring_fulfillment', status: 'open' }),
        expire: async () => ({ id: 'cs_recurring_fulfillment', status: 'expired' }),
      },
    }
  },
}))

vi.mock('../../../../utils/supabase/admin', async () => {
  const { createSupabaseMock } = await import('../../../../test/supabase-mock')
  return {
    hasSupabaseAdminEnv: vi.fn(() => true),
    createAdminClient: vi.fn(() => createSupabaseMock((c) => adminRef.handler(c))),
  }
})

vi.mock('../../../../lib/commerce/settlement-bridge', () => ({
  resolveSettlementContext: vi.fn(async () => ({
    ok: true,
    context: {
      connectAccountId: 'acct_recurring_fulfillment',
      commissionBps: 300,
      commissionPercent: 3,
      commissionSource: 'plan_default',
      planId: 'free',
    },
  })),
}))

import { POST } from './route'

function recurringPage(reviewThreshold = 4) {
  return {
    id: 'p-recurring-fulfillment',
    owner_id: 'o-recurring-fulfillment',
    slug: 'recurring-pet-care',
    name: 'Recurring Pet Care',
    currency: 'usd',
    services: [{
      name: 'Weekly Pet Care',
      price: '$80',
      description: '',
      url: '',
      customerInputs: [{
        key: 'pet_count',
        label: 'Pet count',
        valueType: 'quantity',
        required: true,
        askBuyer: 'How many pets need care?',
        affects: ['eligibility'],
      }],
      fulfillmentRules: [{
        id: 'large-pack-review',
        inputKey: 'pet_count',
        operator: 'gte',
        value: reviewThreshold,
        decision: 'requires-review',
        reasonCode: 'capacity.large_pack',
        message: `${reviewThreshold} or more pets require merchant review.`,
        nextAction: 'contact-merchant',
      }],
      recurringTerms: {
        schemaVersion: 1,
        paymentModel: 'fixed-per-period',
        schedule: { mode: 'fixed', cadence: { interval: 'week', intervalCount: 1 } },
        startPolicy: 'first-successful-payment',
        endPolicy: 'until-cancelled',
        cancellationPolicy: 'period-end',
        pausePolicy: 'unsupported',
      },
    }],
    products: [],
    is_published: true,
  }
}

const post = (body: unknown) => new Request('https://nexez.test/api/service-agreements/checkout', {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json' },
  body: JSON.stringify(body),
})

describe('POST /api/service-agreements/checkout - conditional fulfillment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stripeCalls.length = 0
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_recurring_fulfillment')
    vi.stubEnv('NEXEZ_ACTION_APPROVAL_SECRET', '')
    vi.stubEnv('NEXEZ_REQUIRE_ACTION_APPROVAL_TOKEN', '')
    adminRef.handler = (c: QueryContext) => {
      if (c.table === 'pages') return { data: recurringPage(), error: null }
      return { data: null, error: null }
    }
  })

  afterEach(() => vi.unstubAllEnvs())

  it('blocks review-required recurring configurations before agreement or Stripe creation', async () => {
    const response = await POST(post({
      slug: 'recurring-pet-care',
      offer: 'services-0',
      offerConfiguration: { pet_count: 5 },
    }))

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      code: 'fulfillment_review_required',
      offerFulfillment: {
        schemaVersion: 1,
        decision: 'requires-review',
        matchedRuleIds: ['large-pack-review'],
        policyRules: expect.any(Array),
      },
    })
    expect(stripeCalls).toHaveLength(0)
  })

  it('returns exact eligible fulfillment provenance inside the recurring agreement dry-run', async () => {
    const response = await POST(post({
      slug: 'recurring-pet-care',
      offer: 'services-0',
      dryRun: true,
      offerConfiguration: { pet_count: 2 },
    }))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.offerFulfillment).toMatchObject({
      schemaVersion: 1,
      decision: 'eligible',
      matchedRuleIds: [],
      policyRules: recurringPage().services[0].fulfillmentRules,
    })
    expect(body.recurringAgreement.fulfillment).toEqual(body.offerFulfillment)
    expect(body.recurringAgreementFingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(stripeCalls).toHaveLength(0)
  })

  it('invalidates recurring buyer approval when the exact merchant policy changes', async () => {
    vi.stubEnv('NEXEZ_ACTION_APPROVAL_SECRET', 'recurring-fulfillment-test-secret-at-least-32-characters')
    vi.stubEnv('NEXEZ_REQUIRE_ACTION_APPROVAL_TOKEN', 'true')
    let threshold = 4
    adminRef.handler = (c: QueryContext) => {
      if (c.table === 'pages') return { data: recurringPage(threshold), error: null }
      return { data: null, error: null }
    }

    const preview = await POST(post({
      slug: 'recurring-pet-care',
      offer: 'services-0',
      dryRun: true,
      offerConfiguration: { pet_count: 2 },
    }))
    expect(preview.status).toBe(200)
    const approved = await preview.json()
    expect(approved.approvalToken).toMatch(/^v1\./)

    threshold = 3
    const stale = await POST(post({
      slug: 'recurring-pet-care',
      offer: 'services-0',
      offerConfiguration: { pet_count: 2 },
      approvalToken: approved.approvalToken,
    }))

    expect(stale.status).toBe(403)
    expect((await stale.json()).code).toBe('approval_invalid')
    expect(stripeCalls).toHaveLength(0)
  })
})
