import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueryContext } from '../../../test/supabase-mock'

const { adminRef, stripeCalls, expiredSessions, sessionStatusRef } = vi.hoisted(() => ({
  adminRef: {
    handler: (_c: QueryContext) => ({ data: null, error: null }) as { data?: unknown; error?: { message: string } | null },
  },
  stripeCalls: [] as Array<{ params: any; opts: any }>,
  expiredSessions: [] as Array<{ id: string; params: any; opts: any }>,
  sessionStatusRef: { value: 'open' as 'open' | 'complete' | 'expired' | null },
}))

vi.mock('stripe', () => ({
  default: class {
    checkout = {
      sessions: {
        create: async (params: any, opts: any) => {
          stripeCalls.push({ params, opts })
          return { id: 'cs_config_1', url: 'https://stripe.test/cs_config_1', status: sessionStatusRef.value }
        },
        expire: async (id: string, params: any, opts: any) => {
          expiredSessions.push({ id, params, opts })
          return { id, status: 'expired' }
        },
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
      connectAccountId: 'acct_config',
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

const configuredPage = (affects: string[] = ['duration', 'scope']) => ({
  id: 'p-config',
  owner_id: 'o-config',
  slug: 'configured',
  name: 'Configured Detailer',
  currency: 'usd',
  services: [
    {
      name: 'Mobile Detail',
      price: '$150',
      description: '',
      url: '',
      customerInputs: [
        {
          key: 'vehicle_class',
          label: 'Vehicle class',
          valueType: 'single-select',
          required: true,
          options: [
            { value: 'sedan', label: 'Sedan' },
            { value: 'suv', label: 'SUV' },
          ],
          askBuyer: 'What kind of vehicle should we detail?',
          affects,
        },
        {
          key: 'notes',
          label: 'Notes',
          valueType: 'text',
          required: false,
          askBuyer: 'Anything else?',
          affects: ['scope'],
        },
      ],
    },
  ],
  products: [],
  is_published: true,
})

const post = (body: unknown) =>
  new Request('https://nexez.test/api/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/checkout - transactional offer configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stripeCalls.length = 0
    expiredSessions.length = 0
    sessionStatusRef.value = 'open'
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_config')
    vi.stubEnv('NEXEZ_ACTION_APPROVAL_SECRET', '')
    vi.stubEnv('NEXEZ_REQUIRE_ACTION_APPROVAL_TOKEN', '')
    adminRef.handler = (c: QueryContext) => {
      if (c.table === 'pages') return { data: configuredPage(), error: null }
      return { data: null, error: null }
    }
  })

  afterEach(() => vi.unstubAllEnvs())

  it('binds buyer approval to the exact normalized configuration', async () => {
    vi.stubEnv('NEXEZ_ACTION_APPROVAL_SECRET', 'configured-checkout-test-secret-at-least-32-characters')
    vi.stubEnv('NEXEZ_REQUIRE_ACTION_APPROVAL_TOKEN', 'true')

    const preview = await POST(post({
      slug: 'configured',
      offer: 'services-0',
      dryRun: true,
      offerConfiguration: { vehicle_class: 'suv', notes: '  no fragrance  ' },
    }))
    expect(preview.status).toBe(200)
    const validated = await preview.json()
    expect(validated.offerConfiguration).toEqual({ vehicle_class: 'suv', notes: 'no fragrance' })
    expect(validated.approvalToken).toMatch(/^v1\./)

    const approved = await POST(post({
      slug: 'configured',
      offer: 'services-0',
      offerConfiguration: { notes: 'no fragrance', vehicle_class: 'suv' },
      approvalToken: validated.approvalToken,
    }))
    expect(approved.status).toBe(200)
    expect(stripeCalls).toHaveLength(1)

    const changed = await POST(post({
      slug: 'configured',
      offer: 'services-0',
      offerConfiguration: { notes: 'no fragrance', vehicle_class: 'sedan' },
      approvalToken: validated.approvalToken,
    }))
    expect(changed.status).toBe(403)
    expect((await changed.json()).code).toBe('approval_invalid')
    expect(stripeCalls).toHaveLength(1)
  })

  it('rejects undeclared buyer values before approval or payment side effects', async () => {
    const res = await POST(post({
      slug: 'configured',
      offer: 'services-0',
      offerConfiguration: { vehicle_class: 'monster-truck' },
    }))

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('invalid_offer_configuration')
    expect(body.fields).toContainEqual(expect.objectContaining({ key: 'vehicle_class', code: 'invalid_value' }))
    expect(stripeCalls).toHaveLength(0)
  })

  it('blocks price-affecting buyer configuration until deterministic pricing exists', async () => {
    adminRef.handler = (c: QueryContext) => {
      if (c.table === 'pages') return { data: configuredPage(['price', 'duration']), error: null }
      return { data: null, error: null }
    }

    const res = await POST(post({
      slug: 'configured',
      offer: 'services-0',
      dryRun: true,
      offerConfiguration: { vehicle_class: 'suv' },
    }))

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({
      code: 'offer_configuration_pricing_unresolved',
      fields: ['vehicle_class'],
    })
    expect(stripeCalls).toHaveLength(0)
  })

  it('does not redirect a configured transaction to a provider when Nexez settlement is unavailable', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    const res = await POST(post({
      slug: 'configured',
      offer: 'services-0',
      dryRun: true,
      offerConfiguration: { vehicle_class: 'suv' },
    }))

    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('configured_checkout_requires_nexez_settlement')
    expect(stripeCalls).toHaveLength(0)
  })

  it('stores raw configuration only in the private handoff and puts only its fingerprint on Stripe', async () => {
    let handoffPayload: unknown = null
    adminRef.handler = (c: QueryContext) => {
      if (c.table === 'pages') return { data: configuredPage(), error: null }
      if (c.table === 'checkout_configuration_handoffs' && c.op === 'upsert') handoffPayload = c.payload
      return { data: null, error: null }
    }

    const res = await POST(post({
      slug: 'configured',
      offer: 'services-0',
      offerConfiguration: { vehicle_class: 'suv', notes: 'leave keys with concierge' },
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.offerConfiguration).toEqual({ vehicle_class: 'suv', notes: 'leave keys with concierge' })
    expect(body.offerConfigurationFingerprint).toMatch(/^[a-f0-9]{64}$/)

    expect(handoffPayload).toMatchObject({
      stripe_session_id: 'cs_config_1',
      page_id: 'p-config',
      offer_key: 'services-0',
      configuration: { vehicle_class: 'suv', notes: 'leave keys with concierge' },
      configuration_fingerprint: body.offerConfigurationFingerprint,
    })

    expect(stripeCalls).toHaveLength(1)
    const stripeMetadata = stripeCalls[0].params.metadata
    expect(stripeMetadata.nexez_offer_configuration_hash).toBe(body.offerConfigurationFingerprint)
    expect(stripeMetadata.offer_configuration).toBeUndefined()
    expect(JSON.stringify(stripeMetadata)).not.toContain('leave keys with concierge')
  })

  it('expires the Stripe session and returns no payable URL when the private handoff fails', async () => {
    adminRef.handler = (c: QueryContext) => {
      if (c.table === 'pages') return { data: configuredPage(), error: null }
      if (c.table === 'checkout_configuration_handoffs') return { data: null, error: { message: 'handoff unavailable' } }
      return { data: null, error: null }
    }

    const res = await POST(post({
      slug: 'configured',
      offer: 'services-0',
      offerConfiguration: { vehicle_class: 'suv' },
    }))

    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.code).toBe('configuration_handoff_failed')
    expect(body.url).toBeUndefined()
    expect(expiredSessions).toEqual([{ id: 'cs_config_1', params: {}, opts: { stripeAccount: 'acct_config' } }])
  })

  it('never returns a reused configured Stripe session that is already expired or complete', async () => {
    for (const status of ['expired', 'complete'] as const) {
      sessionStatusRef.value = status
      const res = await POST(post({
        slug: 'configured',
        offer: 'services-0',
        offerConfiguration: { vehicle_class: 'suv' },
      }))

      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({
        code: 'configured_checkout_session_not_open',
        stripeSessionStatus: status,
      })
    }
  })
})
