import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueryContext } from '../../../test/supabase-mock'

const { adminRef, stripeCalls } = vi.hoisted(() => ({
  adminRef: {
    handler: (_c: QueryContext) => ({ data: null, error: null }) as { data?: unknown; error?: { message: string } | null },
  },
  stripeCalls: [] as Array<{ params: any; opts: any }>,
}))

vi.mock('stripe', () => ({
  default: class {
    checkout = {
      sessions: {
        create: async (params: any, opts: any) => {
          stripeCalls.push({ params, opts })
          return { id: 'cs_fulfillment_1', url: 'https://stripe.test/cs_fulfillment_1', status: 'open' }
        },
        expire: async () => ({ id: 'cs_fulfillment_1', status: 'expired' }),
      },
    }
  },
}))

vi.mock('../../../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../../../test/supabase-mock')
  return { supabase: createSupabaseMock(() => ({ data: null, error: null })) }
})

vi.mock('../../../utils/supabase/admin', async () => {
  const { createSupabaseMock } = await import('../../../test/supabase-mock')
  return {
    hasSupabaseAdminEnv: vi.fn(() => true),
    createAdminClient: vi.fn(() => createSupabaseMock((c) => adminRef.handler(c))),
  }
})

vi.mock('../../../lib/commerce/settlement-bridge', () => ({
  resolveSettlementContext: vi.fn(async () => ({
    ok: true,
    context: {
      connectAccountId: 'acct_fulfillment',
      commissionBps: 300,
      commissionPercent: 3,
      commissionSource: 'plan_default',
      planId: 'free',
    },
  })),
}))

vi.mock('../../../lib/server/log-checkout-event', () => ({
  logCheckoutEvent: vi.fn(async () => ({ ok: true })),
}))

vi.mock('../../../lib/server/page-integration-credentials', () => ({
  integrationCredentialsConfigured: () => false,
  getCalendlyPat: async () => null,
}))

vi.mock('../../../lib/server/calendly-write', () => ({
  createCalendlySchedulingLink: async () => null,
}))

import { POST } from './route'

function pageWithPolicy(reviewThreshold = 4) {
  return {
    id: 'p-fulfillment',
    owner_id: 'o-fulfillment',
    slug: 'pet-care',
    name: 'Pet Care',
    currency: 'usd',
    services: [{
      name: 'Pet Care Visit',
      price: '$80',
      description: '',
      url: '',
      customerInputs: [
        {
          key: 'pet_count',
          label: 'Pet count',
          valueType: 'quantity',
          required: true,
          askBuyer: 'How many pets need care?',
          affects: ['eligibility'],
        },
        {
          key: 'care_type',
          label: 'Care type',
          valueType: 'single-select',
          required: true,
          options: [
            { value: 'standard', label: 'Standard care' },
            { value: 'injections', label: 'Injection care' },
          ],
          askBuyer: 'What type of care is needed?',
          affects: ['eligibility'],
        },
      ],
      fulfillmentRules: [
        {
          id: 'large-pack-review',
          inputKey: 'pet_count',
          operator: 'gte',
          value: reviewThreshold,
          decision: 'requires-review',
          reasonCode: 'capacity.large_pack',
          message: `${reviewThreshold} or more pets require merchant review.`,
          nextAction: 'contact-merchant',
        },
        {
          id: 'injection-block',
          inputKey: 'care_type',
          operator: 'equals',
          value: 'injections',
          decision: 'ineligible',
          reasonCode: 'care.injections_unsupported',
          message: 'Injection care is not offered.',
        },
      ],
    }],
    products: [],
    is_published: true,
  }
}

const post = (body: unknown) => new Request('https://nexez.test/api/checkout', {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json' },
  body: JSON.stringify(body),
})

describe('POST /api/checkout - conditional fulfillment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stripeCalls.length = 0
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fulfillment')
    vi.stubEnv('NEXEZ_ACTION_APPROVAL_SECRET', '')
    vi.stubEnv('NEXEZ_REQUIRE_ACTION_APPROVAL_TOKEN', '')
    adminRef.handler = (c: QueryContext) => {
      if (c.table === 'pages') return { data: pageWithPolicy(), error: null }
      return { data: null, error: null }
    }
  })

  afterEach(() => vi.unstubAllEnvs())

  it('returns a machine-distinct review conflict before Stripe side effects', async () => {
    const response = await POST(post({
      slug: 'pet-care',
      offer: 'services-0',
      dryRun: true,
      offerConfiguration: { pet_count: 5, care_type: 'standard' },
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

  it('lets ineligible outrank review and never creates a payable session', async () => {
    const response = await POST(post({
      slug: 'pet-care',
      offer: 'services-0',
      offerConfiguration: { pet_count: 5, care_type: 'injections' },
    }))

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      code: 'fulfillment_ineligible',
      offerFulfillment: {
        decision: 'ineligible',
        matchedRuleIds: ['large-pack-review', 'injection-block'],
      },
    })
    expect(stripeCalls).toHaveLength(0)
  })

  it('dry-runs an eligible decision and persists exact policy provenance only in the private handoff', async () => {
    let handoffPayload: any = null
    adminRef.handler = (c: QueryContext) => {
      if (c.table === 'pages') return { data: pageWithPolicy(), error: null }
      if (c.table === 'checkout_configuration_handoffs' && c.op === 'upsert') handoffPayload = c.payload
      return { data: null, error: null }
    }

    const preview = await POST(post({
      slug: 'pet-care',
      offer: 'services-0',
      dryRun: true,
      offerConfiguration: { pet_count: 2, care_type: 'standard' },
    }))
    expect(preview.status).toBe(200)
    const validated = await preview.json()
    expect(validated.offerFulfillment).toMatchObject({
      schemaVersion: 1,
      decision: 'eligible',
      matchedRuleIds: [],
      policyRules: pageWithPolicy().services[0].fulfillmentRules,
    })
    expect(validated.offerFulfillmentFingerprint).toMatch(/^[a-f0-9]{64}$/)

    const checkout = await POST(post({
      slug: 'pet-care',
      offer: 'services-0',
      offerConfiguration: { pet_count: 2, care_type: 'standard' },
    }))
    expect(checkout.status).toBe(200)
    expect(stripeCalls).toHaveLength(1)
    expect(stripeCalls[0].params.metadata.nexez_offer_fulfillment_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(stripeCalls[0].params.metadata.offer_fulfillment).toBeUndefined()
    expect(handoffPayload.fulfillment_snapshot).toEqual(validated.offerFulfillment)
    expect(handoffPayload.fulfillment_fingerprint).toBe(validated.offerFulfillmentFingerprint)
  })

  it('invalidates buyer approval when the merchant changes fulfillment policy after dry-run', async () => {
    vi.stubEnv('NEXEZ_ACTION_APPROVAL_SECRET', 'conditional-fulfillment-test-secret-at-least-32-characters')
    vi.stubEnv('NEXEZ_REQUIRE_ACTION_APPROVAL_TOKEN', 'true')
    let threshold = 4
    adminRef.handler = (c: QueryContext) => {
      if (c.table === 'pages') return { data: pageWithPolicy(threshold), error: null }
      return { data: null, error: null }
    }

    const preview = await POST(post({
      slug: 'pet-care',
      offer: 'services-0',
      dryRun: true,
      offerConfiguration: { pet_count: 2, care_type: 'standard' },
    }))
    const validated = await preview.json()
    expect(validated.approvalToken).toMatch(/^v1\./)
    expect(validated.offerFulfillment.decision).toBe('eligible')

    threshold = 3
    const stale = await POST(post({
      slug: 'pet-care',
      offer: 'services-0',
      offerConfiguration: { pet_count: 2, care_type: 'standard' },
      approvalToken: validated.approvalToken,
    }))
    expect(stale.status).toBe(403)
    expect((await stale.json()).code).toBe('approval_invalid')
    expect(stripeCalls).toHaveLength(0)
  })
})
