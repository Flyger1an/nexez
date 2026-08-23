import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CommercialCommandCenter } from './CommercialCommandCenter'
import type { CommercialCommandCenter as CommercialSnapshot } from '../../lib/commercial-command-center'

const snapshot: CommercialSnapshot = {
  availability: { analytics: true, negotiations: true, finance: true },
  demand: { aiVisits: 28, discoveryClicks: 9, checkoutStarts: 4, paidOrders: 2, checkoutToPaidRate: 0.5 },
  deals: { needsAction: 3, waiting: 2, staleOpen: 1, disputed: 0 },
  money: [
    { currency: 'usd', grossCents: 12_000, netCents: 10_000, directTransactions: 2, negotiatedDeals: 1 },
    { currency: 'jpy', grossCents: 9_000, netCents: 8_000, directTransactions: 1, negotiatedDeals: 0 },
  ],
  primaryMoney: { currency: 'usd', grossCents: 12_000, netCents: 10_000, directTransactions: 2, negotiatedDeals: 1 },
  actions: [{
    id: 'negotiations',
    label: '3 deals need action',
    detail: '1 open deal is stale.',
    count: 3,
    href: '/dashboard/negotiations?queue=needs_action',
    cta: 'Work the queue',
    tone: 'attention',
  }],
  status: 'attention',
}

describe('CommercialCommandCenter', () => {
  it('renders precise time windows, operational links, and separate currencies', () => {
    const html = renderToStaticMarkup(<CommercialCommandCenter snapshot={snapshot} />)

    expect(html).toContain('Demand · today')
    expect(html).toContain('Deals · current')
    expect(html).toContain('Money · 30 days')
    expect(html).toContain('/dashboard/negotiations?queue=needs_action')
    expect(html).toContain('USD')
    expect(html).toContain('JPY')
    expect(html).toContain('Categories can overlap')
    expect(html).toContain('data-testid="commercial-command-cards"')
    expect(html).toContain('bg-[var(--bg-2)]')
    expect(html).not.toContain('theme-dark-island')
  })

  it('shows unavailable sources as unavailable rather than false zeroes', () => {
    const unavailable: CommercialSnapshot = {
      ...snapshot,
      availability: { analytics: false, negotiations: false, finance: false },
      actions: [],
      status: 'incomplete',
    }
    const html = renderToStaticMarkup(<CommercialCommandCenter snapshot={unavailable} />)

    expect(html).toContain('Analytics totals are temporarily unavailable.')
    expect(html).toContain('Negotiation totals are temporarily unavailable.')
    expect(html).toContain('Finance totals are temporarily unavailable.')
    expect(html).toContain('Some live totals are unavailable')
  })
})
