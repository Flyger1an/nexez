import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueryContext } from '../../../../test/supabase-mock'

const { adminRef, stripeCalls, rpcCalls, stripeRef } = vi.hoisted(() => ({
  adminRef: {
    handler: (_context: QueryContext) => ({ data: null, error: null }) as { data?: unknown; error?: { message: string; code?: string } | null },
  },
  stripeCalls: [] as Array<{ params: any; options: any }>,
  rpcCalls: [] as Array<{ fn: string; payload: any }>,
  stripeRef: {
    expire: async () => ({ id: 'cs_resource_1', status: 'expired' }),
  },
}))

vi.mock('stripe', () => ({
  default: class {
    checkout = {
      sessions: {
        create: async (params: any, options: any) => {
          stripeCalls.push({ params, options })
          return { id: 'cs_resource_1', url: 'https://stripe.test/cs_resource_1', status: 'open', livemode: false }
        },
        expire: async () => stripeRef.expire(),
      },
    }
  },
}))

vi.mock('../../../../utils/supabase/admin', async () => {
  const { createSupabaseMock } = await import('../../../../test/supabase-mock')
  return {
    hasSupabaseAdminEnv: vi.fn(() => true),
    createAdminClient: vi.fn(() => {
      const mock = createSupabaseMock((context) => {
        if (context.table.startsWith('rpc:')) rpcCalls.push({ fn: context.table.slice(4), payload: context.payload })
        return adminRef.handler(context)
      })
      return mock
    }),
  }
})

vi.mock('../../../../lib/commerce/settlement-bridge', () => ({
  resolveSettlementContext: vi.fn(async () => ({
    ok: true,
    context: {
      connectAccountId: 'acct_resource_1',
      commissionBps: 500,
      commissionPercent: 5,
      commissionSource: 'plan_default',
      planId: 'free',
    },
  })),
}))

import { POST } from './route'

const POOL = '11111111-1111-4111-8111-111111111111'
const WINDOW = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const HOLD_EXPIRES = '2099-09-03T18:00:00.000Z'

function resourcePage(source?: string) {
  return {
    id: 'page-resource-1',
    owner_id: 'owner-resource-1',
    slug: 'private-dinner',
    name: 'Private Dinner',
    currency: 'usd',
    services: [{
      name: 'Dinner service',
      price: '$100',
      description: 'An on-site dinner.',
      url: '',
      ...(source ? { source } : {}),
      customerInputs: [{
        key: 'guest_count', label: 'Guest count', valueType: 'quantity', required: true, askBuyer: 'How many guests?',
      }],
      reservableResourceTerms: {
        schemaVersion: 1,
        requirements: [{ poolId: POOL, windowId: WINDOW, quantity: { source: 'input', inputKey: 'guest_count' } }],
      },
    }],
    products: [],
    is_published: true,
  }
}

function request(body: unknown, idempotencyKey?: string) {
  return new Request('https://nexez.test/api/reservable-resources/checkout', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/reservable-resources/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stripeCalls.length = 0
    rpcCalls.length = 0
    stripeRef.expire = async () => ({ id: 'cs_resource_1', status: 'expired' })
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_resources')
    vi.stubEnv('NEXEZ_ACTION_APPROVAL_SECRET', 'resource-approval-secret-at-least-32-characters')
    adminRef.handler = (context) => {
      if (context.table === 'pages') return { data: resourcePage(), error: null }
      if (context.table === 'resource_pools') return { data: [{
        id: POOL,
        owner_id: 'owner-resource-1',
        page_id: 'page-resource-1',
        resource_key: 'guest-capacity',
        label: 'Guest capacity',
        unit_label: 'guests',
        kind: 'reusable',
        total_quantity: 60,
        status: 'active',
        version: 3,
      }], error: null }
      if (context.table === 'resource_pool_windows') return { data: [{
        id: WINDOW,
        pool_id: POOL,
        window_key: 'dinner-evening',
        label: 'Dinner evening',
        starts_at: '2099-09-03T12:00:00.000Z',
        ends_at: '2099-09-03T17:00:00.000Z',
        total_quantity: 40,
        status: 'active',
        version: 2,
      }], error: null }
      if (context.table === 'rpc:acquire_resource_hold') return { data: 'hold-resource-1', error: null }
      if (context.table === 'resource_holds') return { data: {
        id: 'hold-resource-1',
        status: 'active',
        expires_at: HOLD_EXPIRES,
        transaction_fingerprint: context.eqs.id ? rpcCalls.find((call) => call.fn === 'acquire_resource_hold')?.payload.p_transaction_fingerprint : '',
        allocation_fingerprint: rpcCalls.find((call) => call.fn === 'acquire_resource_hold')?.payload.p_allocation_fingerprint,
        stripe_checkout_session_id: null,
        stripe_connect_account_id: null,
      }, error: null }
      if (context.table === 'rpc:attach_resource_hold_payment') return { data: HOLD_EXPIRES, error: null }
      if (context.table === 'rpc:release_resource_hold') return { data: 'cancelled', error: null }
      return { data: null, error: null }
    }
  })

  afterEach(() => vi.unstubAllEnvs())

  it('acquires and exposes a real bounded hold during dry-run without calling Stripe', async () => {
    const response = await POST(request(
      { slug: 'private-dinner', offer: 'services-0', offerConfiguration: { guest_count: 12 }, dryRun: true },
      'resource-checkout-key-0001',
    ))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      provider: 'stripe_reservable_resource',
      amountCents: 10_000,
      resources: {
        status: 'held',
        holdId: 'hold-resource-1',
        expiresAt: HOLD_EXPIRES,
        allocations: [{
          poolId: POOL,
          poolVersion: 3,
          windowId: WINDOW,
          windowVersion: 2,
          quantity: 12,
          unit: 'guests',
        }],
      },
      approvalTokenRequired: true,
    })
    expect(body.approvalToken).toMatch(/^v1\./)
    expect(body.resources.allocationFingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(stripeCalls).toHaveLength(0)
  })

  it('uses the same hold for approval and an immediate card Checkout session', async () => {
    const key = 'resource-checkout-key-0002'
    const input = { slug: 'private-dinner', offer: 'services-0', offerConfiguration: { guest_count: 12 }, buyerAgent: 'Nexxi' }
    const preview = await POST(request({ ...input, dryRun: true }, key))
    const { approvalToken } = await preview.json()
    const response = await POST(request({ ...input, approvalToken }, key))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      provider: 'stripe_reservable_resource',
      checkoutSessionId: 'cs_resource_1',
      resources: { holdId: 'hold-resource-1', status: 'held' },
    })
    expect(stripeCalls).toHaveLength(1)
    const [{ params, options }] = stripeCalls
    expect(params.payment_method_types).toEqual(['card'])
    expect(params.expires_at).toBe(Math.floor(Date.parse(HOLD_EXPIRES) / 1000))
    expect(params.metadata).toMatchObject({
      nexez_kind: 'reservable_resource',
      nexez_resource_hold_id: 'hold-resource-1',
      nexez_source: 'reservable_resource_checkout',
    })
    expect(params.payment_intent_data.application_fee_amount).toBe(500)
    expect(params.success_url).toBe('https://nexez.test/nexxi/checkout/return?status=success&session_id={CHECKOUT_SESSION_ID}')
    expect(params.cancel_url).toBe('https://nexez.test/nexxi/checkout/return?status=cancelled')
    expect(params.origin_context).toBe('mobile_app')
    expect(options).toMatchObject({ stripeAccount: 'acct_resource_1' })
    expect(options.idempotencyKey).toMatch(/^nexez_resources_[a-f0-9]{64}$/)
    expect(rpcCalls.some((call) => call.fn === 'attach_resource_hold_payment')).toBe(true)
  })

  it('releases an unapproved hold and never creates payment', async () => {
    const response = await POST(request(
      { slug: 'private-dinner', offer: 'services-0', offerConfiguration: { guest_count: 12 } },
      'resource-checkout-key-0003',
    ))
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'approval_required' })
    expect(rpcCalls.some((call) => call.fn === 'release_resource_hold')).toBe(true)
    expect(stripeCalls).toHaveLength(0)
  })

  it('preserves external inventory authority', async () => {
    adminRef.handler = (context) => context.table === 'pages'
      ? { data: resourcePage('calendly'), error: null }
      : { data: null, error: null }
    const response = await POST(request(
      { slug: 'private-dinner', offer: 'services-0', offerConfiguration: { guest_count: 12 }, dryRun: true },
      'resource-checkout-key-0004',
    ))
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'resource_terms_required' })
    expect(stripeCalls).toHaveLength(0)
  })

  it('preserves capacity when payment attachment and provider expiry are both uncertain', async () => {
    adminRef.handler = (context) => {
      if (context.table === 'pages') return { data: resourcePage(), error: null }
      if (context.table === 'resource_pools') return { data: [{
        id: POOL, owner_id: 'owner-resource-1', page_id: 'page-resource-1', resource_key: 'guest-capacity',
        label: 'Guest capacity', unit_label: 'guests', kind: 'reusable', total_quantity: 60, status: 'active', version: 3,
      }], error: null }
      if (context.table === 'resource_pool_windows') return { data: [{
        id: WINDOW, pool_id: POOL, window_key: 'dinner-evening', label: 'Dinner evening',
        starts_at: '2099-09-03T12:00:00.000Z', ends_at: '2099-09-03T17:00:00.000Z',
        total_quantity: 40, status: 'active', version: 2,
      }], error: null }
      if (context.table === 'rpc:acquire_resource_hold') return { data: 'hold-resource-1', error: null }
      if (context.table === 'resource_holds') return { data: {
        id: 'hold-resource-1', status: 'active', expires_at: HOLD_EXPIRES,
        transaction_fingerprint: rpcCalls.find((call) => call.fn === 'acquire_resource_hold')?.payload.p_transaction_fingerprint,
        allocation_fingerprint: rpcCalls.find((call) => call.fn === 'acquire_resource_hold')?.payload.p_allocation_fingerprint,
        stripe_checkout_session_id: null, stripe_connect_account_id: null,
      }, error: null }
      if (context.table === 'rpc:attach_resource_hold_payment') return { data: null, error: { message: 'database unavailable' } }
      if (context.table === 'rpc:release_resource_hold') return { data: 'cancelled', error: null }
      return { data: null, error: null }
    }
    stripeRef.expire = async () => { throw new Error('Stripe unavailable') }

    const key = 'resource-checkout-key-uncertain'
    const input = { slug: 'private-dinner', offer: 'services-0', offerConfiguration: { guest_count: 12 } }
    const preview = await POST(request({ ...input, dryRun: true }, key))
    const { approvalToken } = await preview.json()
    const response = await POST(request({ ...input, approvalToken }, key))

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'resource_payment_state_uncertain' })
    expect(rpcCalls.some((call) => call.fn === 'release_resource_hold')).toBe(false)
  })
})
