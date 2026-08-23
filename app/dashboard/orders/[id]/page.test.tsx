// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '../../../../test/dom'

const refs = vi.hoisted(() => ({
  user: { id: 'owner-1' } as { id: string } | null,
  detail: null as null | Record<string, unknown>,
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  refresh: vi.fn(),
  load: vi.fn(),
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({})) }))
vi.mock('next/navigation', () => ({ notFound: refs.notFound, useRouter: () => ({ refresh: refs.refresh }) }))
vi.mock('../../../../utils/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: refs.user } })) },
  }),
}))
vi.mock('../../../../lib/server/dashboard-orders', () => ({
  loadDashboardOrderDetail: (...args: unknown[]) => refs.load(...args),
}))

import OrderDetailPage from './page'

const ORDER_ID = '00000000-0000-4000-8000-123456789abc'

function detail() {
  return {
    order: {
      id: ORDER_ID,
      owner_id: 'owner-1',
      page_id: 'page-1',
      slug: 'studio',
      offer_name: 'Wedding film',
      offer_key: 'services-1',
      amount_cents: 5_000,
      currency: 'usd',
      status: 'paid',
      channel: 'staged_settlement',
      refunded_cents: 0,
      buyer_email: 'buyer@example.com',
      buyer_name: 'Avery Buyer',
      buyer_reference: 'PO-44',
      buyer_agent: 'Buyer Bot',
      commission_bps: 900,
      commission_percent: 9,
      application_fee_cents: 450,
      plan_id_at_purchase: 'free',
      commission_source: 'plan_default',
      stripe_livemode: true,
      stripe_session_id: 'cs_live_1234567890abcdefghijkl',
      stripe_payment_intent_id: 'pi_1234567890abcdefghijkl',
      stripe_invoice_id: null,
      service_agreement_id: null,
      service_period_start: null,
      service_period_end: null,
      staged_settlement_agreement_id: 'agreement-1',
      staged_settlement_obligation_id: 'obligation-1',
      resource_hold_id: null,
      metadata: {},
      created_at: '2026-08-23T12:00:00.000Z',
      updated_at: '2026-08-23T12:05:00.000Z',
    },
    requests: [],
    reviews: [],
    stagedAgreement: {
      id: 'agreement-1',
      status: 'active',
      total_amount_cents: 10_000,
      currency: 'usd',
      offer_name: 'Wedding film',
      buyer_name: 'Avery Buyer',
      buyer_email: 'buyer@example.com',
      completed_at: null,
      created_at: '2026-08-23T12:00:00.000Z',
    },
    stagedObligations: [
      { id: 'obligation-1', stage_id: 'deposit', stage_order: 1, label: 'Deposit', kind: 'commitment', amount_cents: 5_000, status: 'paid', stripe_livemode: true, application_fee_cents: 450, paid_at: '2026-08-23T12:00:00.000Z', refunded_at: null, disputed_at: null },
      { id: 'obligation-2', stage_id: 'completion', stage_order: 2, label: 'Final delivery', kind: 'completion', amount_cents: 5_000, status: 'pending', stripe_livemode: null, application_fee_cents: null, paid_at: null, refunded_at: null, disputed_at: null },
    ],
    serviceAgreement: null,
    resourceReservation: null,
    fulfillment: null,
    events: [
      {
        id: 'event-2',
        event_type: 'payment_confirmed',
        source: 'stripe',
        metadata: { amount_cents: 5_000, currency: 'usd' },
        created_at: '2026-08-23T12:05:00.000Z',
      },
      {
        id: 'event-1',
        event_type: 'order_recorded',
        source: 'system',
        metadata: { channel: 'staged_settlement' },
        created_at: '2026-08-23T12:00:00.000Z',
      },
    ],
    issues: [],
  }
}

describe('order detail dashboard', () => {
  beforeEach(() => {
    refs.user = { id: 'owner-1' }
    refs.detail = detail()
    refs.notFound.mockClear()
    refs.refresh.mockClear()
    refs.load.mockReset().mockImplementation(async () => refs.detail)
  })

  it('loads the order with the authenticated owner identity', async () => {
    render(await OrderDetailPage({ params: Promise.resolve({ id: ORDER_ID }) }))
    expect(refs.load).toHaveBeenCalledWith(expect.anything(), 'owner-1', ORDER_ID)
    expect(screen.getByRole('heading', { name: 'Wedding film' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Staged agreement' })).toBeInTheDocument()
    expect(screen.getByText('Deposit')).toBeInTheDocument()
    expect(screen.getByText('Final delivery')).toBeInTheDocument()
    expect(screen.getByText('Avery Buyer')).toBeInTheDocument()
    expect(screen.getByText('$45.50')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Order operations' })).toBeInTheDocument()
    expect(screen.getByText('This payment is a commitment stage, not delivered work. Fulfillment belongs on a milestone or completion payment.')).toBeInTheDocument()
    expect(screen.getByText('Payment confirmed')).toBeInTheDocument()
  })

  it('returns not found when the owner-scoped loader cannot see the order', async () => {
    refs.detail = null
    await expect(OrderDetailPage({ params: Promise.resolve({ id: ORDER_ID }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(refs.notFound).toHaveBeenCalledOnce()
  })

  it('keeps signed-out viewers away from order data', async () => {
    refs.user = null
    render(await OrderDetailPage({ params: Promise.resolve({ id: ORDER_ID }) }))
    expect(refs.load).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Sign in to view this order' })).toHaveAttribute('href', `/login?next=/dashboard/orders/${ORDER_ID}`)
  })
})
