// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '../../test/dom'
import { CalendlyBookingsCard } from './CalendlyBookingsCard'
import { IntegrationsHealthPanel } from './IntegrationsHealthPanel'
import { OutboundActivityCard } from './OutboundActivityCard'

function editor(overrides: Record<string, unknown> = {}) {
  return {
    id: 'page-1',
    page: {
      versions: [],
      outbound_webhooks: [{ url: 'https://hooks.example.test/nexez' }],
      team_collaboration: {
        approvals: [{ id: 'approval-1', status: 'pending', ts: '2026-08-22T00:00:00Z' }],
      },
    },
    integrationStatus: {
      calendly: { lastSync: '2026-08-22T00:00:00Z', maskedToken: '••••' },
      stripe: { lastImport: '2026-08-22T00:00:00Z' },
      square: { lastImport: '2026-08-22T00:00:00Z' },
    },
    integrationResyncing: null,
    googleCalendarId: '',
    integrationsEnabled: false,
    outboundWebhooksEnabled: false,
    teamCollaborationEnabled: false,
    resyncIntegration: vi.fn(),
    requestTeamApproval: vi.fn(),
    sendTestBooking: vi.fn(),
    lastBooking: {
      event_name: 'Consultation',
      invitee_name: 'Buyer',
      at: '2026-08-22T00:00:00Z',
    },
    recentCalendlyBookings: [],
    recentOutboundFires: [],
    ...overrides,
  } as any
}

describe('editor downgrade surfaces', () => {
  it('retains premium integration history but removes execution actions below Pro', () => {
    render(<IntegrationsHealthPanel e={editor()} />)

    expect(screen.getByText(/Calendly · paused by plan/)).toBeVisible()
    expect(screen.getByText(/Square · paused by plan/)).toBeVisible()
    expect(screen.getByText(/webhook URL retained · paused/)).toBeVisible()
    expect(screen.getByText(/Team: 1 pending · paused/)).toBeVisible()
    expect(screen.getAllByRole('button', { name: 'Re-sync' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /Request approval/ })).not.toBeInTheDocument()
  })

  it('labels retained Calendly history as paused and hides test execution', () => {
    render(<CalendlyBookingsCard e={editor()} />)
    expect(screen.getByText('History retained · automation paused by plan')).toBeVisible()
    expect(screen.getByText(/Consultation with Buyer/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Send test booking' })).not.toBeInTheDocument()
  })

  it('labels retained outbound history as paused instead of claiming delivery is active', () => {
    render(<OutboundActivityCard e={editor()} />)
    expect(screen.getByText('History retained · delivery paused by plan')).toBeVisible()
    expect(screen.getByText(/will not receive new booking events/)).toBeVisible()
    expect(screen.queryByText('Automatic on bookings')).not.toBeInTheDocument()
  })

  it('offers Shopify re-sync below Pro while explaining the installed-app exception', () => {
    const e = editor({
      integrationStatus: {
        shopify: { lastImport: '2026-08-22T00:00:00Z', kind: 'oauth' },
      },
    })
    render(<IntegrationsHealthPanel e={e} />)

    expect(screen.getByText(/Shopify ✓ installed app · every plan/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Re-sync' })).toBeEnabled()
    expect(screen.getByText(/installed Shopify app remains active on every plan/i)).toBeVisible()
  })

  it('labels manual Shopify credentials as retained and paused below Pro', () => {
    render(<IntegrationsHealthPanel e={editor({
      integrationStatus: {
        shopify: { lastImport: '2026-08-22T00:00:00Z', kind: 'token' },
      },
    })} />)

    expect(screen.getByText(/manual Admin connection paused by plan/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Re-sync' })).not.toBeInTheDocument()
  })

  it('does not present a past public Shopify import as a live connection', () => {
    render(<IntegrationsHealthPanel e={editor({
      integrationStatus: {
        shopify: { lastImport: '2026-08-22T00:00:00Z', kind: 'other' },
      },
    })} />)

    expect(screen.getByText(/past public import · not a live connection/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Re-sync' })).not.toBeInTheDocument()
  })

  it('restores premium actions only for an entitled owner', () => {
    const e = editor({
      integrationsEnabled: true,
      outboundWebhooksEnabled: true,
      teamCollaborationEnabled: true,
    })
    render(<IntegrationsHealthPanel e={e} />)

    expect(screen.getAllByRole('button', { name: 'Re-sync' })).toHaveLength(3)
    expect(screen.getByRole('button', { name: /Request approval/ })).toBeVisible()
    expect(screen.getByText(/webhook URL active/)).toBeVisible()
  })
})
