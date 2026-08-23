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
vi.mock('../../../lib/server/dashboard-commerce', () => ({
  DASHBOARD_COMMERCE_LIMIT: 25,
  loadDashboardCommerce: vi.fn(async () => refs.result),
}))

import CommercePage from './page'

const checkoutRecord = {
  key: 'checkout:order-1',
  id: 'order-1',
  rail: 'checkout',
  railLabel: 'Checkout order',
  offerName: 'Portrait session',
  buyerLabel: 'Buyer',
  buyerEmail: 'buyer@example.com',
  channelLabel: 'Agent checkout',
  sourceStatus: { key: 'paid', label: 'Paid', tone: 'ready' },
  paymentState: { key: 'paid', label: 'Paid', tone: 'ready' },
  fulfillmentState: { key: 'in_progress', label: 'In progress', tone: 'signal' },
  amountCents: 10_000,
  amountRole: 'recorded_payment',
  amountLabel: 'Recorded payment',
  currency: 'usd',
  mode: 'live',
  createdAt: '2026-08-23T10:00:00.000Z',
  updatedAt: '2026-08-23T11:00:00.000Z',
  href: '/dashboard/orders/order-1',
  actionLabel: 'Manage order',
}

const negotiatedRecord = {
  key: 'negotiated:deal-1',
  id: 'deal-1',
  rail: 'negotiated',
  railLabel: 'Negotiated commerce',
  offerName: 'Strategy engagement',
  buyerLabel: 'Agent buyer',
  buyerEmail: null,
  channelLabel: 'Negotiated escrow',
  sourceStatus: { key: 'agreement_proposed', label: 'Agreement proposed', tone: 'signal' },
  paymentState: { key: 'not_recorded', label: 'No Nexez payment', tone: 'muted' },
  fulfillmentState: null,
  amountCents: 12_500,
  amountRole: 'commercial_terms',
  amountLabel: 'Agreed value',
  currency: 'usd',
  mode: 'unverified',
  createdAt: '2026-08-23T10:00:00.000Z',
  updatedAt: '2026-08-23T12:00:00.000Z',
  href: '/dashboard/negotiations#negotiation-deal-1',
  actionLabel: 'Open negotiation',
}

describe('commerce dashboard', () => {
  beforeEach(() => {
    refs.user = { id: 'owner-1' }
    refs.result = {
      records: [negotiatedRecord, checkoutRecord],
      checkoutCount: 1,
      negotiatedCount: 1,
      total: 2,
      filters: { q: '', rail: '', currency: '' },
      issues: [],
    }
  })

  it('requires authentication before showing cross-rail records', async () => {
    refs.user = null
    render(await CommercePage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByRole('link', { name: 'Sign in to view commerce' })).toHaveAttribute('href', '/login?next=/dashboard/commerce')
  })

  it('renders both rails without presenting negotiation terms as payment', async () => {
    render(await CommercePage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByRole('heading', { name: 'Commerce' })).toBeInTheDocument()
    expect(screen.getAllByText('Portrait session').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Strategy engagement').length).toBeGreaterThan(0)
    expect(screen.getAllByText('No Nexez payment').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Agreed value').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Manage order ORDER-1' })).toHaveAttribute('href', '/dashboard/orders/order-1')
    expect(screen.getByRole('link', { name: 'Open negotiation DEAL-1' })).toHaveAttribute('href', '/dashboard/negotiations#negotiation-deal-1')
  })

  it('explains the ledger boundary when no commerce exists', async () => {
    refs.result = {
      records: [],
      checkoutCount: 0,
      negotiatedCount: 0,
      total: 0,
      filters: { q: '', rail: '', currency: '' },
      issues: [],
    }
    render(await CommercePage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText(/Simulator activity and abandoned checkout attempts are never included/i)).toBeInTheDocument()
  })

  it('does not present an unqueried rail as an evidence-backed zero', async () => {
    refs.result = {
      records: [checkoutRecord],
      checkoutCount: 1,
      negotiatedCount: null,
      total: 1,
      filters: { q: '', rail: 'checkout', currency: '' },
      issues: [],
    }
    render(await CommercePage({ searchParams: Promise.resolve({ rail: 'checkout' }) }))
    expect(screen.getByText('Not queried')).toBeInTheDocument()
  })
})
