import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseMock, type QueryContext } from '../../test/supabase-mock'
import {
  DASHBOARD_COMMERCE_LIMIT,
  loadDashboardCommerce,
  normalizeCommerceSearch,
  parseDashboardCommerceFilters,
} from './dashboard-commerce'

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
  status: 'agreement_proposed',
  escrow_mode: 'manual_capture_ready',
  refunded_cents: 0,
  buyer_email: 'agent@example.com',
  contact: null,
  buyer_agent: 'buyer-agent',
  stripe_payment_intent_id: null,
  stripe_livemode: null,
  created_at: '2026-08-23T10:00:00.000Z',
  updated_at: '2026-08-23T12:00:00.000Z',
}

function result(context: QueryContext) {
  if (context.table === 'checkout_orders') return { data: [checkout], error: null, count: 4 }
  if (context.table === 'agent_negotiations') return { data: [negotiated], error: null, count: 2 }
  if (context.table === 'checkout_order_fulfillments') {
    return { data: [{ order_id: checkout.id, status: 'fulfilled' }], error: null }
  }
  return { data: [], error: null }
}

describe('dashboard commerce loader', () => {
  it('normalizes bounded filters and rejects unsupported rails', () => {
    expect(normalizeCommerceSearch('  buyer,(test)%  ')).toBe('buyer test')
    expect(parseDashboardCommerceFilters({ q: [' cake ', 'ignored'], rail: 'negotiated', currency: 'USD' }))
      .toEqual({ q: 'cake', rail: 'negotiated', currency: 'usd' })
    expect(parseDashboardCommerceFilters({ rail: 'escrow),owner_id.neq.owner-1', currency: 'dollars' }))
      .toEqual({ q: '', rail: '', currency: '' })
  })

  it('loads both authoritative rails in parallel and preserves their distinct states', async () => {
    const client = createSupabaseMock(result) as unknown as SupabaseClient
    const loaded = await loadDashboardCommerce(client, 'owner-1', {})

    expect(loaded.total).toBe(6)
    expect(loaded.checkoutCount).toBe(4)
    expect(loaded.negotiatedCount).toBe(2)
    expect(loaded.records.map((record) => record.key)).toEqual(['negotiated:deal-1', 'checkout:order-1'])
    expect(loaded.records[0].paymentState.key).toBe('not_recorded')
    expect(loaded.records[1].fulfillmentState?.key).toBe('fulfilled')
    expect(loaded.issues).toEqual([])
  })

  it('owner-scopes every read and bounds each rail before merging', async () => {
    const contexts: QueryContext[] = []
    const client = createSupabaseMock((context) => {
      contexts.push(context)
      return result(context)
    }) as unknown as SupabaseClient

    await loadDashboardCommerce(client, 'owner-1', { q: 'buyer', currency: 'usd' })

    for (const context of contexts) {
      expect(context.eqs.owner_id).toBe('owner-1')
    }
    for (const table of ['checkout_orders', 'agent_negotiations']) {
      const context = contexts.find((item) => item.table === table)
      expect(context?.calls).toContainEqual(['limit', DASHBOARD_COMMERCE_LIMIT])
      expect(context?.calls.some(([method]) => method === 'or')).toBe(true)
      expect(context?.eqs.currency).toBe('usd')
    }
  })

  it('does not query the hidden rail when a rail filter is selected', async () => {
    const contexts: QueryContext[] = []
    const client = createSupabaseMock((context) => {
      contexts.push(context)
      return result(context)
    }) as unknown as SupabaseClient

    const loaded = await loadDashboardCommerce(client, 'owner-1', { rail: 'checkout' })
    expect(contexts.some((context) => context.table === 'agent_negotiations')).toBe(false)
    expect(loaded.negotiatedCount).toBeNull()
    expect(loaded.records.every((record) => record.rail === 'checkout')).toBe(true)
  })

  it('degrades one failed rail without erasing successful records', async () => {
    const client = createSupabaseMock((context) => {
      if (context.table === 'agent_negotiations') return { data: null, error: { message: 'unavailable' }, count: null }
      return result(context)
    }) as unknown as SupabaseClient

    const loaded = await loadDashboardCommerce(client, 'owner-1', {})
    expect(loaded.records.map((record) => record.key)).toEqual(['checkout:order-1'])
    expect(loaded.negotiatedCount).toBeNull()
    expect(loaded.issues).toEqual(['Negotiated commerce could not be loaded.'])
  })
})
