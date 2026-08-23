// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '../../../test/dom'

const refs = vi.hoisted(() => ({
  user: { id: 'owner-1' } as { id: string } | null,
  result: null as null | Record<string, unknown>,
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({})) }))
vi.mock('../../../utils/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: refs.user } })) },
  }),
}))
vi.mock('../../../lib/server/dashboard-orders', () => ({
  loadDashboardOrders: vi.fn(async () => refs.result),
}))

import OrdersPage from './page'

const ORDER = {
  id: '00000000-0000-4000-8000-123456789abc',
  owner_id: 'owner-1',
  page_id: 'page-1',
  slug: 'studio',
  offer_name: 'Portrait session',
  offer_key: 'services-1',
  amount_cents: 10_000,
  currency: 'usd',
  status: 'paid',
  channel: 'agent_checkout',
  refunded_cents: 0,
  buyer_email: 'buyer@example.com',
  buyer_name: 'Buyer',
  buyer_reference: null,
  buyer_agent: null,
  commission_bps: 900,
  commission_percent: 9,
  application_fee_cents: 900,
  plan_id_at_purchase: 'free',
  commission_source: 'plan_default',
  stripe_livemode: true,
  stripe_session_id: 'cs_live_1',
  stripe_payment_intent_id: 'pi_1',
  stripe_invoice_id: null,
  service_agreement_id: null,
  service_period_start: null,
  service_period_end: null,
  staged_settlement_agreement_id: null,
  staged_settlement_obligation_id: null,
  resource_hold_id: null,
  metadata: {},
  created_at: '2026-08-23T12:00:00.000Z',
  updated_at: '2026-08-23T12:00:00.000Z',
}

describe('orders dashboard', () => {
  beforeEach(() => {
    refs.user = { id: 'owner-1' }
    refs.result = {
      orders: [ORDER],
      total: 1,
      pages: 1,
      filters: { q: '', status: '', channel: '', currency: '', page: 1 },
      error: null,
    }
  })

  it('requires authentication before showing the merchant ledger', async () => {
    refs.user = null
    render(await OrdersPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByRole('link', { name: 'Sign in to manage orders' })).toHaveAttribute('href', '/login?next=/dashboard/orders')
  })

  it('renders durable order context and a dedicated detail link', async () => {
    render(await OrdersPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByRole('heading', { name: 'Orders' })).toBeInTheDocument()
    expect(screen.getAllByText('Portrait session').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/^\$100(?:\.00)?$/).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Open order 56789ABC' })).toHaveAttribute('href', `/dashboard/orders/${ORDER.id}`)
    expect(screen.getByRole('link', { name: /View finance/i })).toHaveAttribute('href', '/dashboard/finance')
  })

  it('explains that simulator activity never becomes an order', async () => {
    refs.result = {
      orders: [],
      total: 0,
      pages: 1,
      filters: { q: '', status: '', channel: '', currency: '', page: 1 },
      error: null,
    }
    render(await OrdersPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText(/Simulator activity and abandoned checkout attempts never become orders/i)).toBeInTheDocument()
  })
})
