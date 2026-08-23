// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../../../test/dom'
import type { PlanId } from '../../../lib/billing'

const refs = vi.hoisted(() => ({ plan: 'free' as PlanId }))

vi.mock('../../../components/billing/PlanProvider', () => ({
  usePlan: () => refs.plan,
}))
vi.mock('../../../components/ApiKeysManager', () => ({
  ApiKeysManager: ({ currentPlan }: { currentPlan: PlanId }) => <div>API key controls for {currentPlan}</div>,
}))
vi.mock('../../../components/tools/CalendlyTool', () => ({
  CalendlyTool: () => <div>Calendly live controls</div>,
}))
vi.mock('../../../components/tools/Importers', () => ({
  StripeImporter: () => <div>Stripe catalog controls</div>,
  ShopifyImporter: () => <div>Shopify controls</div>,
  SquareImporter: () => <div>Square controls</div>,
  AcuityImporter: () => <div>Acuity controls</div>,
}))

import ToolsPage from './page'

describe('Tools plan allocation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('shows truthful upgrade surfaces instead of premium Calendly controls on Free', async () => {
    refs.plan = 'free'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ webhooks: [] }))))

    render(<ToolsPage />)

    expect(screen.getByText('Calendly import & sync')).toBeVisible()
    expect(screen.queryByText('Calendly live controls')).not.toBeInTheDocument()
    expect(screen.queryByText(/15%/)).not.toBeInTheDocument()
    expect(screen.getByText(/transaction economics are shown in Billing/i)).toBeVisible()
    await waitFor(() => expect(fetch).toHaveBeenCalled())
  })

  it('renders premium connector controls on Pro', () => {
    refs.plan = 'pro'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ webhooks: [] }))))

    render(<ToolsPage />)

    expect(screen.getByText('Calendly live controls')).toBeVisible()
    expect(screen.getByText('Stripe catalog controls')).toBeVisible()
    expect(screen.getByText('Google Calendar').closest('li')).toHaveTextContent(
      /sample availability windows.*not connected or synced/i,
    )
    expect(screen.getByText(/Google samples and one-time imports remain explicitly labeled/i)).toBeVisible()
  })

  it('keeps retained webhook removal available below Pro while hiding test and creation', async () => {
    refs.plan = 'launch'
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE') return new Response(JSON.stringify({ success: true }))
      return new Response(JSON.stringify({
        webhooks: [{
          id: 'webhook-1',
          url: 'https://hooks.example.test/nexez',
          active: true,
          secret: 'whsec_retained',
          last_status: null,
          last_delivery_at: null,
          created_at: '2026-08-21T00:00:00.000Z',
        }],
      }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<ToolsPage />)

    expect(await screen.findByText('https://hooks.example.test/nexez')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Send test' })).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('https://your-webhook.site/endpoint')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/dashboard/outbound-webhooks?id=webhook-1',
      { method: 'DELETE' },
    ))
  })
})
