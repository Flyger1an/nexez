import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { QueryContext } from '../../../test/supabase-mock'

const { dbRef, adminRef, stripeCalls, credRef } = vi.hoisted(() => ({
  dbRef: { handler: (_c: any) => ({ data: null, error: null }) as { data?: any; error?: any; count?: number | null } },
  adminRef: { handler: (_c: any) => ({ data: null, error: null }) as { data?: any; error?: any; count?: number | null } },
  stripeCalls: [] as Array<{ params: any; opts: any }>,
  credRef: { configured: true, pat: 'pat' as string | null, minted: 'https://calendly.com/acme/intro/one-time-xyz' as string | null, patCalls: 0 },
}))

vi.mock('stripe', () => ({
  default: class {
    checkout = {
      sessions: {
        create: async (params: any, opts: any) => {
          stripeCalls.push({ params, opts })
          return { id: 'cs_test_1', url: 'https://stripe.test/cs_test_1' }
        },
      },
    }
  },
}))

vi.mock('../../../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../../../test/supabase-mock')
  return { supabase: createSupabaseMock((c) => dbRef.handler(c)) }
})
vi.mock('../../../utils/supabase/admin', async () => {
  const { createSupabaseMock } = await import('../../../test/supabase-mock')
  return {
    hasSupabaseAdminEnv: vi.fn(() => true),
    createAdminClient: vi.fn(() => createSupabaseMock((c) => adminRef.handler(c))),
  }
})
vi.mock('../../../lib/server/log-checkout-event', () => ({
  logCheckoutEvent: vi.fn(async () => ({ ok: true })),
}))
vi.mock('../../../lib/server/page-integration-credentials', () => ({
  integrationCredentialsConfigured: () => credRef.configured,
  getCalendlyPat: async () => { credRef.patCalls += 1; return credRef.pat },
}))
vi.mock('../../../lib/server/calendly-write', () => ({
  createCalendlySchedulingLink: async () => credRef.minted,
}))

import { POST } from './route'

const fixedPage = (rules?: Record<string, unknown>) => ({
  id: 'p1',
  owner_id: 'o1',
  slug: 'demo',
  name: 'Demo Co',
  services: [
    {
      name: 'Deep Clean',
      price: '$150',
      description: '',
      url: 'https://book.example.com/deep-clean',
      ...(rules ? { rules } : {}),
    },
  ],
  products: [],
  is_published: true,
})

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://nexez.test/api/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
    body: JSON.stringify(body),
  })

describe('POST /api/checkout - agent action safety', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    stripeCalls.length = 0
    const { hasSupabaseAdminEnv } = await import('../../../utils/supabase/admin')
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
    adminRef.handler = (c: QueryContext) =>
      c.table === 'pages' ? { data: fixedPage(), error: null } : { data: null, error: null, count: 0 }
  })

  afterEach(() => vi.unstubAllEnvs())

  it('binds a required approval token to the exact validated checkout', async () => {
    vi.stubEnv('NEXEZ_ACTION_APPROVAL_SECRET', 'route-test-secret-with-at-least-thirty-two-characters')
    vi.stubEnv('NEXEZ_REQUIRE_ACTION_APPROVAL_TOKEN', 'true')

    const preview = await POST(post({ slug: 'demo', offer: 'services-0', query: 'Book this.', dryRun: true }))
    expect(preview.status).toBe(200)
    const validation = await preview.json()
    expect(validation.approvalTokenRequired).toBe(true)
    expect(validation.approvalToken).toMatch(/^v1\./)

    const approved = await POST(post({
      slug: 'demo',
      offer: 'services-0',
      query: 'Book this.',
      approvalToken: validation.approvalToken,
    }))
    expect(approved.status).toBe(200)

    const changed = await POST(post({
      slug: 'demo',
      offer: 'services-0',
      query: 'Book a different scope.',
      approvalToken: validation.approvalToken,
    }))
    expect(changed.status).toBe(403)
    expect((await changed.json()).code).toBe('approval_invalid')
  })

  it('fails closed when approval enforcement is enabled without its secret', async () => {
    vi.stubEnv('NEXEZ_ACTION_APPROVAL_SECRET', '')
    vi.stubEnv('NEXEZ_REQUIRE_ACTION_APPROVAL_TOKEN', 'true')
    const res = await POST(post({ slug: 'demo', offer: 'services-0' }))
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('approval_not_configured')
  })

  it('rejects malformed idempotency keys before creating a checkout', async () => {
    const res = await POST(post(
      { slug: 'demo', offer: 'services-0' },
      { 'idempotency-key': 'short' },
    ))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('invalid_idempotency_key')
  })
})

describe('POST /api/checkout - Smart Rules calendar protection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbRef.handler = () => ({ data: null, error: null })
    adminRef.handler = () => ({ data: null, error: null, count: 0 })
  })

  // The checkout route reads owner-private booking rules, so the page lookup uses the
  // service-role client (admin) when configured - the page fixture lives on adminRef.
  it('409 when the weekly booking cap is reached (count from checkout_events)', async () => {
    adminRef.handler = (c: QueryContext) =>
      c.table === 'pages' ? { data: fixedPage({ maxBookingsPerWeek: 2 }), error: null } : { data: null, error: null, count: 2 }
    const res = await POST(post({ slug: 'demo', offer: 'services-0' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('booking_rules')
    expect(body.error).toMatch(/booking limit/i)
  })

  it('proceeds to the provider redirect when under the cap', async () => {
    adminRef.handler = (c: QueryContext) =>
      c.table === 'pages' ? { data: fixedPage({ maxBookingsPerWeek: 2 }), error: null } : { data: null, error: null, count: 1 }
    const res = await POST(post({ slug: 'demo', offer: 'services-0' }))
    expect(res.status).toBe(200)
    expect((await res.json()).url).toBe('https://book.example.com/deep-clean')
  })

  it('409 on a blackout date even without the service role', async () => {
    const { hasSupabaseAdminEnv } = await import('../../../utils/supabase/admin')
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(false)
    const today = new Date().toISOString().slice(0, 10)
    dbRef.handler = (c: QueryContext) => (c.table === 'pages' ? { data: fixedPage({ blackoutDates: [today] }), error: null } : { data: null })
    const res = await POST(post({ slug: 'demo', offer: 'services-0' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/blackout/i)
  })

  it('never charges the platform account when the seller has no Connect - routes to the external link', async () => {
    // Stripe key IS set and admin env is available, the offer has a price, but the
    // owner has no Connect account (billing_subscriptions returns null). The charge
    // must NOT run on the platform account; it falls back to the external link.
    const { hasSupabaseAdminEnv } = await import('../../../utils/supabase/admin')
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x')
    adminRef.handler = (c: QueryContext) =>
      c.table === 'pages' ? { data: fixedPage(), error: null } : { data: null, error: null, count: 0 }
    const res = await POST(post({ slug: 'demo', offer: 'services-0' }))
    expect(res.status).toBe(200)
    expect((await res.json()).url).toBe('https://book.example.com/deep-clean')
    vi.unstubAllEnvs()
  })

  it('offers without rules are unaffected (no admin involvement on a no-service-role deploy)', async () => {
    const { hasSupabaseAdminEnv, createAdminClient } = await import('../../../utils/supabase/admin')
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(false)
    dbRef.handler = (c: QueryContext) => (c.table === 'pages' ? { data: fixedPage(), error: null } : { data: null })
    const res = await POST(post({ slug: 'demo', offer: 'services-0' }))
    expect(res.status).toBe(200)
    // No rules + no service role → neither the page read nor a booking-count query touches admin.
    expect(vi.mocked(createAdminClient)).not.toHaveBeenCalled()
  })
})

describe('POST /api/checkout - buyer identity propagation', () => {
  // Connect-ready seller so the live Stripe branch runs (page + a charges-enabled
  // billing_subscriptions row, both on the service-role client).
  beforeEach(async () => {
    vi.clearAllMocks()
    stripeCalls.length = 0
    const { hasSupabaseAdminEnv } = await import('../../../utils/supabase/admin')
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x')
    adminRef.handler = (c: QueryContext) => {
      if (c.table === 'pages') return { data: fixedPage(), error: null }
      if (c.table === 'billing_subscriptions')
        return { data: { plan_id: 'free', status: 'active', stripe_connect_account_id: 'acct_test', stripe_connect_charges_enabled: true }, error: null }
      return { data: null, error: null, count: 0 }
    }
  })
  afterEach(() => vi.unstubAllEnvs())

  it('forwards declared buyer identity to the Stripe session (email lowercased, ref + metadata)', async () => {
    const res = await POST(
      post({ slug: 'demo', offer: 'services-0', buyerEmail: 'Buyer@Example.com', buyerName: 'Acme Buyer', buyerReference: 'PO-9', buyerAgent: 'shopbot/2' }),
    )
    expect(res.status).toBe(200)
    expect(stripeCalls).toHaveLength(1)
    const { params, opts } = stripeCalls[0]
    expect(opts.stripeAccount).toBe('acct_test')
    expect(params.customer_email).toBe('buyer@example.com')
    expect(params.client_reference_id).toBe('PO-9')
    expect(params.metadata.nexez_buyer_email).toBe('buyer@example.com')
    expect(params.metadata.nexez_buyer_name).toBe('Acme Buyer')
    expect(params.metadata.nexez_buyer_reference).toBe('PO-9')
    expect(params.metadata.nexez_buyer_agent).toBe('shopbot/2')
  })

  it('scopes and hashes the retry key before forwarding it to Stripe', async () => {
    const rawKey = 'buyer-order-1234567890'
    const res = await POST(post(
      { slug: 'demo', offer: 'services-0' },
      { 'idempotency-key': rawKey },
    ))
    expect(res.status).toBe(200)
    expect(stripeCalls).toHaveLength(1)
    expect(stripeCalls[0].opts.idempotencyKey).toMatch(/^nexez_checkout_[a-f0-9]{64}$/)
    expect(stripeCalls[0].opts.idempotencyKey).not.toContain(rawKey)
  })

  it('omits buyer fields when none are provided', async () => {
    const res = await POST(post({ slug: 'demo', offer: 'services-0' }))
    expect(res.status).toBe(200)
    expect(stripeCalls).toHaveLength(1)
    expect(stripeCalls[0].params.customer_email).toBeUndefined()
    expect(stripeCalls[0].params.metadata.nexez_buyer_email).toBeUndefined()
  })

  it('puts the Connect platform fee under payment_intent_data, not the session top level', async () => {
    // Top-level application_fee_amount is rejected by Stripe for Checkout Sessions ("unknown
    // parameter"), which silently fell back to the provider URL - no real charge. It must live
    // under payment_intent_data for a direct charge on the connected account.
    const res = await POST(post({ slug: 'demo', offer: 'services-0' }))
    expect(res.status).toBe(200)
    const { params } = stripeCalls[0]
    expect(params.application_fee_amount).toBeUndefined()
    expect(params.payment_intent_data?.application_fee_amount).toBe(1350) // $150 × 9% (free plan)
    expect(params.metadata).toMatchObject({
      nexez_owner_plan: 'free',
      nexez_commission_bps: '900',
      nexez_commission_percent: '9',
      nexez_commission_source: 'plan_default',
      nexez_application_fee_cents: '1350',
    })
  })

  it('drops a malformed buyer email (no customer_email)', async () => {
    const res = await POST(post({ slug: 'demo', offer: 'services-0', buyerEmail: 'nope' }))
    expect(res.status).toBe(200)
    expect(stripeCalls[0].params.customer_email).toBeUndefined()
  })

  it('keeps a provider-preferred Shopify product on Shopify even when Stripe Connect is ready', async () => {
    const shopifyUrl = 'https://nexez-tester.myshopify.com/products/agent-ready-cap'
    const shopifyPage = {
      ...fixedPage(),
      services: [
        {
          ...fixedPage().services[0],
          name: 'Agent-ready cap',
          url: shopifyUrl,
          source: 'shopify',
          prefer_original_for_this: true,
          metadata: { commerce_provider: 'shopify', shopify_product_id: 'gid://shopify/Product/1' },
        },
      ],
    }
    adminRef.handler = (c: QueryContext) => {
      if (c.table === 'pages') return { data: shopifyPage, error: null }
      if (c.table === 'billing_subscriptions') {
        return {
          data: {
            plan_id: 'free',
            status: 'active',
            stripe_connect_account_id: 'acct_test',
            stripe_connect_charges_enabled: true,
          },
          error: null,
        }
      }
      return { data: null, error: null, count: 0 }
    }

    const res = await POST(post({ slug: 'demo', offer: 'services-0' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ url: shopifyUrl, provider: 'provider_redirect' })
    expect(stripeCalls).toHaveLength(0)
  })

  it('reports a provider-preferred Shopify product as provider-ready during a dry run', async () => {
    const shopifyUrl = 'https://nexez-tester.myshopify.com/products/agent-ready-cap'
    const shopifyPage = {
      ...fixedPage(),
      services: [
        {
          ...fixedPage().services[0],
          url: shopifyUrl,
          source: 'shopify',
          prefer_original_for_this: true,
          metadata: { commerce_provider: 'shopify' },
        },
      ],
    }
    adminRef.handler = (c: QueryContext) => {
      if (c.table === 'pages') return { data: shopifyPage, error: null }
      if (c.table === 'billing_subscriptions') {
        return {
          data: {
            plan_id: 'free',
            status: 'active',
            stripe_connect_account_id: 'acct_test',
            stripe_connect_charges_enabled: true,
          },
          error: null,
        }
      }
      return { data: null, error: null, count: 0 }
    }

    const res = await POST(post({ slug: 'demo', offer: 'services-0', dryRun: true }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ provider: 'provider_ready', actionUrl: shopifyUrl })
    expect(stripeCalls).toHaveLength(0)
  })
})

describe('POST /api/checkout - single-use Calendly links', () => {
  const calendlyPage = (over: Record<string, any> = {}) => ({
    id: 'p1',
    owner_id: 'o1',
    slug: 'demo',
    name: 'Demo Co',
    services: [{ name: 'Intro Call', price: 'Custom', description: '', url: 'https://calendly.com/acme/intro', source: 'calendly', metadata: { calendly_event_type: 'https://api.calendly.com/event_types/GB' }, ...over }],
    products: [],
    is_published: true,
  })
  beforeEach(async () => {
    vi.clearAllMocks()
    credRef.configured = true
    credRef.pat = 'pat'
    credRef.minted = 'https://calendly.com/acme/intro/one-time-xyz'
    credRef.patCalls = 0
    const { hasSupabaseAdminEnv } = await import('../../../utils/supabase/admin')
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
    adminRef.handler = (c: QueryContext) => (c.table === 'pages' ? { data: calendlyPage(), error: null } : { data: null, error: null, count: 0 })
  })
  afterEach(() => vi.unstubAllEnvs())

  it('mints a one-time booking link as the destination for a connected Calendly offer', async () => {
    const res = await POST(post({ slug: 'demo', offer: 'services-0' }))
    expect(res.status).toBe(200)
    expect((await res.json()).url).toBe('https://calendly.com/acme/intro/one-time-xyz')
  })

  it('falls back to the reusable link when the page has no stored PAT', async () => {
    credRef.pat = null
    const res = await POST(post({ slug: 'demo', offer: 'services-0' }))
    expect((await res.json()).url).toBe('https://calendly.com/acme/intro')
  })

  it('falls back to the reusable link when the credential store is not configured (dormant, no PAT read)', async () => {
    credRef.configured = false
    const res = await POST(post({ slug: 'demo', offer: 'services-0' }))
    expect((await res.json()).url).toBe('https://calendly.com/acme/intro')
    expect(credRef.patCalls).toBe(0) // never touches the credential store when dormant
  })

  it('falls back to the reusable link when Calendly minting fails', async () => {
    credRef.minted = null
    const res = await POST(post({ slug: 'demo', offer: 'services-0' }))
    expect((await res.json()).url).toBe('https://calendly.com/acme/intro')
  })

  it('never mints for a non-Calendly offer or an offer missing the event-type URI', async () => {
    adminRef.handler = (c: QueryContext) => (c.table === 'pages' ? { data: calendlyPage({ source: 'shopify', metadata: {} }), error: null } : { data: null, error: null, count: 0 })
    const res = await POST(post({ slug: 'demo', offer: 'services-0' }))
    expect((await res.json()).url).toBe('https://calendly.com/acme/intro')
    expect(credRef.patCalls).toBe(0)
  })
})
