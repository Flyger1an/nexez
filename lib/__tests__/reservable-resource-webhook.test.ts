import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import type { QueryContext } from '../../test/supabase-mock'

const { adminRef, rpcCalls } = vi.hoisted(() => ({
  adminRef: {
    handler: (_context: QueryContext) => ({ data: null, error: null }) as { data?: unknown; error?: { message: string; code?: string } | null },
  },
  rpcCalls: [] as Array<{ fn: string; payload: any }>,
}))

vi.mock('../../utils/supabase/admin', async () => {
  const { createSupabaseMock } = await import('../../test/supabase-mock')
  const client = createSupabaseMock((context) => {
    if (context.table.startsWith('rpc:')) rpcCalls.push({ fn: context.table.slice(4), payload: context.payload })
    return adminRef.handler(context)
  })
  return {
    hasSupabaseAdminEnv: vi.fn(() => true),
    createAdminClient: vi.fn(() => client),
  }
})

import {
  handleReservableResourceStripeEvent,
  resourceHoldMatchesSession,
} from '../server/reservable-resource-webhook'

const hold = {
  id: 'hold-1',
  owner_id: 'owner-1',
  page_id: 'page-1',
  offer_key: 'services:0',
  status: 'payment_pending',
  transaction_fingerprint: 'a'.repeat(64),
  allocation_fingerprint: 'b'.repeat(64),
  stripe_checkout_session_id: 'cs_1',
  stripe_connect_account_id: 'acct_1',
  stripe_payment_intent_id: null,
  payment_event_id: null,
  amount_cents: 10_000,
  currency: 'usd',
}

function session(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: 'cs_1',
    object: 'checkout.session',
    payment_status: 'paid',
    amount_total: 10_000,
    currency: 'usd',
    payment_intent: 'pi_1',
    livemode: false,
    metadata: {
      nexez_kind: 'reservable_resource',
      nexez_resource_hold_id: 'hold-1',
      nexez_resource_transaction_fingerprint: 'a'.repeat(64),
      nexez_resource_allocation_fingerprint: 'b'.repeat(64),
      nexez_owner_id: 'owner-1',
      nexez_page_id: 'page-1',
      nexez_page_slug: 'dinner',
      nexez_offer_key: 'services:0',
      nexez_offer_name: 'Dinner',
      nexez_application_fee_cents: '500',
      nexez_commission_bps: '500',
      nexez_commission_percent: '5',
      nexez_owner_plan: 'free',
      nexez_commission_source: 'plan_default',
    },
    ...overrides,
  } as Stripe.Checkout.Session
}

function event(type: 'checkout.session.completed' | 'checkout.session.expired', object = session()): Stripe.Event {
  return {
    id: type === 'checkout.session.completed' ? 'evt_paid_1' : 'evt_expired_1',
    type,
    account: 'acct_1',
    data: { object },
  } as Stripe.Event
}

describe('reservable resource webhook provenance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rpcCalls.length = 0
    adminRef.handler = (context) => {
      if (context.table === 'stripe_webhook_events' && context.op === 'insert') return { data: null, error: null }
      if (context.table === 'resource_holds') return { data: hold, error: null }
      if (context.table === 'rpc:commit_resource_hold') return { data: 'reservation-1', error: null }
      if (context.table === 'rpc:release_resource_hold') return { data: 'expired', error: null }
      if (context.table === 'checkout_orders' && context.op === 'upsert') return { data: { id: 'order-1' }, error: null }
      if (context.table === 'rpc:link_resource_reservation_order') return { data: true, error: null }
      return { data: null, error: null }
    }
  })

  it('matches only exact account, identity, fingerprints, and money', () => {
    expect(resourceHoldMatchesSession({ hold, session: session(), account: 'acct_1', requirePaid: true })).toBe(true)
    expect(resourceHoldMatchesSession({ hold, session: session({ amount_total: 9_999 }), account: 'acct_1', requirePaid: true })).toBe(false)
    expect(resourceHoldMatchesSession({ hold, session: session({ currency: 'eur' }), account: 'acct_1', requirePaid: true })).toBe(false)
    expect(resourceHoldMatchesSession({ hold, session: session(), account: 'acct_other', requirePaid: true })).toBe(false)
    expect(resourceHoldMatchesSession({
      hold,
      session: session({ metadata: { ...session().metadata, nexez_resource_allocation_fingerprint: 'c'.repeat(64) } }),
      account: 'acct_1',
      requirePaid: true,
    })).toBe(false)
  })

  it('commits the exact paid hold and links a normal order', async () => {
    const response = await handleReservableResourceStripeEvent(event('checkout.session.completed'))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      resources: true,
      hold: 'hold-1',
      reservation: 'reservation-1',
      order: 'order-1',
      status: 'committed',
    })
    expect(rpcCalls.find((call) => call.fn === 'commit_resource_hold')?.payload).toMatchObject({
      p_hold_id: 'hold-1',
      p_stripe_checkout_session_id: 'cs_1',
      p_stripe_connect_account_id: 'acct_1',
      p_stripe_payment_intent_id: 'pi_1',
      p_payment_event_id: 'evt_paid_1',
    })
    expect(rpcCalls.find((call) => call.fn === 'link_resource_reservation_order')?.payload).toEqual({
      p_hold_id: 'hold-1',
      p_checkout_order_id: 'order-1',
    })
  })

  it('releases only the matching provider-expired session', async () => {
    const expiredSession = session({ payment_status: 'unpaid', amount_total: null, payment_intent: null })
    const response = await handleReservableResourceStripeEvent(event('checkout.session.expired', expiredSession))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ resources: true, status: 'expired' })
    expect(rpcCalls.find((call) => call.fn === 'release_resource_hold')?.payload).toEqual({
      p_hold_id: 'hold-1',
      p_reason: 'provider_expired',
      p_stripe_checkout_session_id: 'cs_1',
    })
  })

  it('acknowledges mismatched paid sessions without committing or releasing inventory', async () => {
    const response = await handleReservableResourceStripeEvent(event('checkout.session.completed', session({ amount_total: 1 })))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ resources: false, reason: 'stale_or_mismatched_resource_checkout' })
    expect(rpcCalls).toHaveLength(0)
  })
})
