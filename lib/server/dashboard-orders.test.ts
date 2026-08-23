import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseMock } from '../../test/supabase-mock'
import {
  DASHBOARD_ORDER_PAGE_SIZE,
  loadDashboardOrderDetail,
  loadDashboardOrders,
  normalizeOrderSearch,
  parseDashboardOrderFilters,
} from './dashboard-orders'

function listClient() {
  const calls: Array<[string, ...unknown[]]> = []
  const builder = {
    select: (...args: unknown[]) => { calls.push(['select', ...args]); return builder },
    eq: (...args: unknown[]) => { calls.push(['eq', ...args]); return builder },
    gt: (...args: unknown[]) => { calls.push(['gt', ...args]); return builder },
    or: (...args: unknown[]) => { calls.push(['or', ...args]); return builder },
    order: (...args: unknown[]) => { calls.push(['order', ...args]); return builder },
    range: (...args: unknown[]) => { calls.push(['range', ...args]); return builder },
    returns: async () => ({ data: [], error: null, count: 52 }),
  }
  const client = {
    from: (table: string) => { calls.push(['from', table]); return builder },
  } as unknown as SupabaseClient
  return { client, calls }
}

describe('dashboard order loader', () => {
  it('normalizes incoming filters without allowing PostgREST control characters', () => {
    expect(normalizeOrderSearch('  buyer,(test)%  ')).toBe('buyer test')
    expect(parseDashboardOrderFilters({
      q: [' cake ', 'ignored'],
      status: 'partial_refund',
      channel: 'staged_settlement',
      currency: 'USD',
      page: '3',
    })).toEqual({
      q: 'cake',
      status: 'partial_refund',
      channel: 'staged_settlement',
      currency: 'usd',
      page: 3,
    })
  })

  it('rejects unsupported filter values', () => {
    expect(parseDashboardOrderFilters({
      status: 'pending',
      channel: 'x),owner_id.neq.owner-1',
      currency: 'dollars',
      page: '-4',
    })).toEqual({ q: '', status: '', channel: '', currency: '', page: 1 })
  })

  it('always owner-scopes the ledger query and paginates on the server', async () => {
    const { client, calls } = listClient()
    const result = await loadDashboardOrders(client, 'owner-1', {
      status: 'partial_refund',
      page: '2',
    })

    expect(calls).toContainEqual(['from', 'checkout_orders'])
    expect(calls).toContainEqual(['eq', 'owner_id', 'owner-1'])
    expect(calls).toContainEqual(['eq', 'status', 'paid'])
    expect(calls).toContainEqual(['gt', 'refunded_cents', 0])
    expect(calls).toContainEqual(['range', DASHBOARD_ORDER_PAGE_SIZE, DASHBOARD_ORDER_PAGE_SIZE * 2 - 1])
    expect(result.total).toBe(52)
    expect(result.pages).toBe(3)
  })

  it('loads owner-scoped fulfillment and append-only activity with order detail', async () => {
    const order = {
      id: 'order-1',
      owner_id: 'owner-1',
      status: 'paid',
      staged_settlement_agreement_id: null,
      service_agreement_id: null,
      resource_hold_id: null,
    }
    const client = createSupabaseMock((context) => {
      if (context.table === 'checkout_orders') return { data: order, error: null }
      if (context.table === 'checkout_order_fulfillments') return { data: { order_id: 'order-1', status: 'in_progress', version: 2 }, error: null }
      if (context.table === 'checkout_order_events') return { data: [{ id: 'event-1', event_type: 'payment_confirmed', source: 'stripe', metadata: {}, created_at: '2026-08-23T12:00:00.000Z' }], error: null }
      return { data: context.table === 'order_requests' || context.table === 'order_reviews' ? [] : null, error: null }
    }) as unknown as SupabaseClient

    const detail = await loadDashboardOrderDetail(client, 'owner-1', 'order-1')
    expect(detail?.fulfillment).toMatchObject({ status: 'in_progress', version: 2 })
    expect(detail?.events).toHaveLength(1)
    expect(detail?.issues).toEqual([])
  })
})
