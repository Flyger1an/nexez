import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseMock, type QueryContext } from '../../test/supabase-mock'
import {
  DASHBOARD_COMMERCE_ACTION_SOURCE_LIMIT,
  loadDashboardCommerceActions,
} from './dashboard-commerce-actions'

const checkout = {
  id: 'order-1',
  offer_name: 'Portrait session',
  amount_cents: 10_000,
  currency: 'usd',
  status: 'paid',
  channel: 'agent_checkout',
  refunded_cents: 0,
  buyer_email: 'buyer@example.com',
  buyer_name: 'Buyer',
  buyer_reference: null,
  buyer_agent: null,
  stripe_livemode: true,
  created_at: '2026-08-23T10:00:00.000Z',
  updated_at: '2026-08-23T11:00:00.000Z',
}

const negotiated = {
  id: 'deal-1',
  offer_name: 'Strategy engagement',
  amount_cents: 12_500,
  currency: 'usd',
  status: 'negotiation',
  escrow_mode: 'manual_capture_ready',
  refunded_cents: 0,
  buyer_email: 'agent@example.com',
  contact: null,
  buyer_agent: 'buyer-agent',
  stripe_payment_intent_id: null,
  stripe_livemode: null,
  settlement_state: null,
  decision_pending: false,
  metadata: {},
  created_at: '2026-08-23T10:00:00.000Z',
  updated_at: '2026-08-23T12:00:00.000Z',
}

function hasCall(context: QueryContext, method: string, column: string) {
  return context.calls.some(([name, first]) => name === method && first === column)
}

function result(context: QueryContext) {
  if (context.table === 'order_requests') {
    return {
      data: [{
        id: 'request-1',
        order_kind: 'checkout',
        order_id: checkout.id,
        kind: 'refund_request',
        status: 'open',
        updated_at: '2026-08-23T13:00:00.000Z',
      }],
      error: null,
      count: 1,
    }
  }
  if (context.table === 'checkout_order_fulfillments') {
    return { data: [{ order_id: checkout.id, status: 'not_started', updated_at: checkout.updated_at }], error: null, count: 1 }
  }
  if (context.table === 'checkout_orders' && context.eqs.status === 'disputed') return { data: [], error: null, count: 0 }
  if (context.table === 'checkout_orders' && hasCall(context, 'in', 'id')) return { data: [checkout], error: null }
  if (context.table === 'agent_negotiations' && hasCall(context, 'in', 'status')) return { data: [negotiated], error: null, count: 1 }
  return { data: [], error: null }
}

describe('dashboard commerce action loader', () => {
  it('loads and prioritizes deduplicated actions across both native rails', async () => {
    const client = createSupabaseMock(result) as unknown as SupabaseClient
    const loaded = await loadDashboardCommerceActions(client, 'owner-1', Date.parse('2026-08-23T13:00:00.000Z'))

    expect(loaded.actions.map((action) => action.key)).toEqual(['checkout:order-1', 'negotiated:deal-1'])
    expect(loaded.actions[0].actions.map((action) => action.key)).toEqual(['refund_request', 'fulfillment'])
    expect(loaded.actions[1].primaryAction.label).toBe('Review proposal')
    expect(loaded.issues).toEqual([])
  })

  it('owner-scopes and bounds every candidate-source read', async () => {
    const contexts: QueryContext[] = []
    const client = createSupabaseMock((context) => {
      contexts.push(context)
      return result(context)
    }) as unknown as SupabaseClient

    await loadDashboardCommerceActions(client, 'owner-1')

    for (const context of contexts) expect(context.eqs.owner_id).toBe('owner-1')
    for (const table of ['order_requests', 'checkout_order_fulfillments']) {
      const context = contexts.find((item) => item.table === table)
      expect(context?.calls).toContainEqual(['limit', DASHBOARD_COMMERCE_ACTION_SOURCE_LIMIT])
    }
  })

  it('does not fabricate missing actions when a source read fails', async () => {
    const client = createSupabaseMock((context) => {
      if (context.table === 'order_requests') return { data: null, error: { message: 'unavailable' }, count: null }
      if (context.table === 'checkout_order_fulfillments') return { data: [], error: null, count: 0 }
      if (context.table === 'checkout_orders') return { data: [], error: null, count: 0 }
      if (context.table === 'agent_negotiations') return { data: [], error: null, count: 0 }
      return { data: [], error: null }
    }) as unknown as SupabaseClient

    const loaded = await loadDashboardCommerceActions(client, 'owner-1')
    expect(loaded.actions).toEqual([])
    expect(loaded.issues).toEqual(['Buyer requests could not be checked for the action queue.'])
  })

  it('marks the result bounded when any candidate source exceeds its returned window', async () => {
    const client = createSupabaseMock((context) => {
      const value = result(context)
      return context.table === 'order_requests' ? { ...value, count: 101 } : value
    }) as unknown as SupabaseClient
    const loaded = await loadDashboardCommerceActions(client, 'owner-1')
    expect(loaded.isTruncated).toBe(true)
  })
})
