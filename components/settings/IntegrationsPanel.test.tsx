// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '../../test/dom'
import { IntegrationsPanel } from './IntegrationsPanel'

type TestConnection = {
  provider: 'calendly' | 'shopify' | 'square' | 'acuity' | 'stripe'
  label: string
  connected: boolean
  kind: 'token' | 'oauth' | 'connect'
  autoSync: boolean
  canSync: boolean
  lastSyncedAt: string | null
  syncStatus?: 'idle' | 'pending' | 'attention'
  syncError?: string | null
}

function mockContext(integrations: TestConnection[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify({ integrations, contextLimited: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('IntegrationsPanel priority emphasis', () => {
  it('recommends only the first actionable connection and keeps other providers neutral', async () => {
    mockContext([
      {
        provider: 'calendly',
        label: 'Calendly',
        connected: false,
        kind: 'token',
        autoSync: false,
        canSync: true,
        lastSyncedAt: null,
      },
      {
        provider: 'shopify',
        label: 'Shopify',
        connected: false,
        kind: 'token',
        autoSync: true,
        canSync: true,
        lastSyncedAt: null,
      },
      {
        provider: 'stripe',
        label: 'Stripe payouts',
        connected: true,
        kind: 'connect',
        autoSync: false,
        canSync: false,
        lastSyncedAt: null,
      },
    ])

    const { container } = render(<IntegrationsPanel pageId="page-1" isPro onMessage={() => {}} />)

    const calendlyAction = await screen.findByRole('button', { name: 'Connect Calendly' })
    const shopifyAction = screen.getByRole('button', { name: 'Connect Shopify' })

    expect(screen.getByRole('group', { name: 'Recommended next step: Calendly' })).toHaveClass('settings-priority-card')
    expect(calendlyAction).toHaveClass('settings-emphasis-action')
    expect(shopifyAction).toHaveClass('btn-secondary')
    expect(shopifyAction).not.toHaveClass('settings-emphasis-action')
    expect(screen.getByText('Connected')).toHaveClass('text-[var(--fg-muted)]')
    expect(container.querySelectorAll('.settings-priority-card')).toHaveLength(1)
    expect(container.querySelectorAll('.settings-emphasis-action')).toHaveLength(1)
  })

  it('prioritizes a connected provider that needs a manual sync over a new connection', async () => {
    mockContext([
      {
        provider: 'calendly',
        label: 'Calendly',
        connected: true,
        kind: 'token',
        autoSync: true,
        canSync: true,
        lastSyncedAt: '2026-08-14T12:00:00.000Z',
        syncStatus: 'attention',
        syncError: 'Reconnect to resume automatic updates.',
      },
      {
        provider: 'shopify',
        label: 'Shopify',
        connected: false,
        kind: 'token',
        autoSync: true,
        canSync: true,
        lastSyncedAt: null,
      },
    ])

    const { container } = render(<IntegrationsPanel pageId="page-1" isPro onMessage={() => {}} />)

    const syncAction = await screen.findByRole('button', { name: 'Sync Calendly' })

    expect(screen.getByRole('group', { name: 'Recommended next step: Calendly' })).toHaveClass('settings-priority-card')
    expect(syncAction).toHaveClass('settings-emphasis-action')
    expect(screen.getByRole('button', { name: 'Connect Shopify' })).toHaveClass('btn-secondary')
    expect(screen.getByText('Needs attention')).toHaveClass('text-[var(--amber)]')
    expect(screen.getByRole('alert')).toHaveClass('text-[var(--amber)]')
    expect(container.querySelectorAll('.settings-priority-card')).toHaveLength(1)
    expect(container.querySelectorAll('.settings-emphasis-action')).toHaveLength(1)
  })

  it('does not present a disabled Pro setup as the recommended next action', async () => {
    mockContext([
      {
        provider: 'calendly',
        label: 'Calendly',
        connected: false,
        kind: 'token',
        autoSync: false,
        canSync: true,
        lastSyncedAt: null,
      },
    ])

    const { container } = render(<IntegrationsPanel pageId="page-1" isPro={false} onMessage={() => {}} />)
    const connect = await screen.findByRole('button', { name: 'Connect Calendly' })

    expect(connect).toBeDisabled()
    expect(connect).toHaveClass('btn-secondary')
    expect(container.querySelector('.settings-priority-card')).not.toBeInTheDocument()
    expect(container.querySelector('.settings-emphasis-action')).not.toBeInTheDocument()
  })

  it('uses teal only after a successful sync has been observed', async () => {
    mockContext([
      {
        provider: 'calendly',
        label: 'Calendly',
        connected: true,
        kind: 'token',
        autoSync: true,
        canSync: true,
        lastSyncedAt: null,
      },
      {
        provider: 'shopify',
        label: 'Shopify',
        connected: true,
        kind: 'oauth',
        autoSync: true,
        canSync: true,
        lastSyncedAt: '2026-08-14T12:00:00.000Z',
      },
    ])

    render(<IntegrationsPanel pageId="page-1" isPro onMessage={() => {}} />)

    expect(await screen.findByText('Connected')).toHaveClass('text-[var(--fg-muted)]')
    expect(screen.getByText('Synced')).toHaveClass('text-[var(--ready)]')
  })

  it('keeps foundational Stripe payout setup available below Pro', async () => {
    mockContext([{
      provider: 'stripe',
      label: 'Stripe payouts',
      connected: false,
      kind: 'connect',
      autoSync: false,
      canSync: false,
      lastSyncedAt: null,
    }])

    render(<IntegrationsPanel pageId="page-1" isPro={false} onMessage={() => {}} />)

    expect(await screen.findByText('Stripe payouts')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Set up payouts' })).toHaveAttribute('href', '/dashboard/billing')
    expect(screen.queryByText('Connecting live integrations is a Pro feature.')).not.toBeInTheDocument()
  })

  it('pauses retained premium sync below Pro while keeping disconnect available', async () => {
    mockContext([{
      provider: 'calendly',
      label: 'Calendly',
      connected: true,
      kind: 'token',
      autoSync: true,
      canSync: true,
      lastSyncedAt: '2026-08-14T12:00:00.000Z',
      syncStatus: 'attention',
      syncError: 'Reconnect to resume automatic updates.',
    }])

    render(<IntegrationsPanel pageId="page-1" isPro={false} onMessage={() => {}} />)

    expect(await screen.findByText('Paused by plan')).toBeVisible()
    expect(screen.getByText(/Connection retained · sync paused until Pro/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Sync Calendly' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Disconnect Calendly' })).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps an installed Shopify OAuth connection active below Pro', async () => {
    mockContext([{
      provider: 'shopify',
      label: 'Shopify',
      connected: true,
      kind: 'oauth',
      autoSync: true,
      canSync: true,
      lastSyncedAt: '2026-08-14T12:00:00.000Z',
      syncStatus: 'idle',
      syncError: null,
    }])

    render(<IntegrationsPanel pageId="page-1" isPro={false} onMessage={() => {}} />)

    expect(await screen.findByRole('button', { name: 'Sync Shopify' })).toBeEnabled()
    expect(screen.getByText(/Installed securely through Shopify · available on every plan/)).toBeVisible()
    expect(screen.queryByText('Paused by plan')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Disconnect Shopify' })).not.toBeInTheDocument()
  })
})
