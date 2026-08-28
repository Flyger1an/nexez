import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../test/supabase-mock'

vi.mock('../../utils/supabase/admin', () => ({ createAdminClient: vi.fn(), hasSupabaseAdminEnv: vi.fn() }))

import { getPageIntegrationConnections } from './integration-connections'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'

function drive(secrets: any, billing: any, shopifyInstall: any = null, managedConnections: any[] = []) {
  vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
  vi.mocked(createAdminClient).mockReturnValue(
    createSupabaseMock((ctx: any) => {
      if (ctx.table === 'page_secrets') return { data: secrets, error: null }
      if (ctx.table === 'shopify_installs') return { data: shopifyInstall, error: null }
      if (ctx.table === 'billing_subscriptions') return { data: billing, error: null }
      if (ctx.table === 'merchant_connector_connections') return { data: managedConnections, error: null }
      return { data: null, error: null }
    }) as any,
  )
}

const byProvider = (arr: any[]) => Object.fromEntries(arr.map((c) => [c.provider, c]))

describe('getPageIntegrationConnections', () => {
  beforeEach(() => vi.clearAllMocks())

  it('empty when the service role is not configured', async () => {
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(false)
    expect(await getPageIntegrationConnections('pg1', 'o1')).toEqual([])
  })

  it('reflects stored Calendly + Shopify connections and their sync semantics', async () => {
    drive(
      { calendly_pat_encrypted: 'v1.x', shopify_credentials_encrypted: null, calendly_synced_at: '2026-07-08T18:00:00Z' },
      null,
    )
    const c = byProvider(await getPageIntegrationConnections('pg1', 'o1'))
    expect(c.calendly).toMatchObject({ connected: true, kind: 'token', autoSync: true, canSync: true, lastSyncedAt: '2026-07-08T18:00:00Z' })
    expect(c.shopify).toMatchObject({ connected: false, kind: 'token', autoSync: false, canSync: true })
  })

  it('prefers managed Calendly OAuth health while preserving legacy personal-token connections', async () => {
    drive(
      { calendly_pat_encrypted: 'legacy-encrypted', shopify_credentials_encrypted: null, calendly_synced_at: '2026-07-08T18:00:00Z' },
      null,
      null,
      [{
        page_id: 'pg1',
        provider: 'calendly',
        status: 'attention',
        last_synced_at: '2026-08-27T12:00:00Z',
        last_error: 'Reconnect Calendly.',
        capabilities: ['catalog', 'availability', 'bookings'],
      }],
    )

    const c = byProvider(await getPageIntegrationConnections('pg1', 'o1'))

    expect(c.calendly).toMatchObject({
      connected: true,
      kind: 'oauth',
      autoSync: true,
      canSync: true,
      lastSyncedAt: '2026-08-27T12:00:00Z',
      syncStatus: 'attention',
      syncError: 'Reconnect Calendly.',
    })
  })

  it('reports managed Calendly OAuth as connected without a legacy personal token', async () => {
    drive(
      { calendly_pat_encrypted: null, shopify_credentials_encrypted: null, calendly_synced_at: null },
      null,
      null,
      [{
        page_id: 'pg1',
        provider: 'calendly',
        status: 'connected',
        last_synced_at: '2026-08-27T13:00:00Z',
        last_error: null,
        capabilities: ['catalog', 'availability', 'bookings'],
      }],
    )

    const c = byProvider(await getPageIntegrationConnections('pg1', 'o1'))

    expect(c.calendly).toMatchObject({
      connected: true,
      kind: 'oauth',
      lastSyncedAt: '2026-08-27T13:00:00Z',
      syncStatus: 'idle',
    })
  })

  it('marks Stripe connected only when account, charges, and payouts are ready', async () => {
    drive(
      { calendly_pat_encrypted: null, shopify_credentials_encrypted: null, calendly_synced_at: null },
      { stripe_connect_account_id: 'acct_1', stripe_connect_charges_enabled: true, stripe_connect_payouts_enabled: true },
    )
    let c = byProvider(await getPageIntegrationConnections('pg1', 'o1'))
    expect(c.stripe).toMatchObject({
      label: 'Stripe payouts',
      connected: true,
      kind: 'connect',
      autoSync: false,
      canSync: false,
    })

    drive(
      { calendly_pat_encrypted: null, shopify_credentials_encrypted: null, calendly_synced_at: null },
      { stripe_connect_account_id: 'acct_1', stripe_connect_charges_enabled: true, stripe_connect_payouts_enabled: false },
    )
    c = byProvider(await getPageIntegrationConnections('pg1', 'o1'))
    expect(c.stripe.connected).toBe(false)

    drive(
      { calendly_pat_encrypted: null, shopify_credentials_encrypted: null, calendly_synced_at: null },
      { stripe_connect_account_id: 'acct_1', stripe_connect_charges_enabled: false, stripe_connect_payouts_enabled: true },
    )
    c = byProvider(await getPageIntegrationConnections('pg1', 'o1'))
    expect(c.stripe.connected).toBe(false)
  })

  it('Shopify connected when a credential blob is stored', async () => {
    drive({ calendly_pat_encrypted: null, shopify_credentials_encrypted: 'v1.y', calendly_synced_at: null }, null)
    const c = byProvider(await getPageIntegrationConnections('pg1', 'o1'))
    expect(c.shopify.connected).toBe(true)
  })

  it('prefers an OAuth app installation and exposes its last successful sync', async () => {
    drive(
      { calendly_pat_encrypted: null, shopify_credentials_encrypted: null, calendly_synced_at: null },
      null,
      { last_synced_at: '2026-07-12T18:00:00Z' },
    )
    const c = byProvider(await getPageIntegrationConnections('pg1', 'o1'))
    expect(c.shopify).toMatchObject({
      connected: true,
      kind: 'oauth',
      autoSync: true,
      canSync: true,
      lastSyncedAt: '2026-07-12T18:00:00Z',
      syncStatus: 'idle',
    })
  })

  it('surfaces queued and failed Shopify auto-sync health without exposing credentials', async () => {
    drive(
      { calendly_pat_encrypted: null, shopify_credentials_encrypted: null, calendly_synced_at: null },
      null,
      {
        last_synced_at: '2026-07-12T18:00:00Z',
        catalog_sync_pending_at: '2026-07-13T12:00:00Z',
        catalog_sync_error: null,
      },
    )
    let c = byProvider(await getPageIntegrationConnections('pg1', 'o1'))
    expect(c.shopify).toMatchObject({ autoSync: true, syncStatus: 'pending', syncError: null })

    drive(
      { calendly_pat_encrypted: null, shopify_credentials_encrypted: null, calendly_synced_at: null },
      null,
      { last_synced_at: null, catalog_sync_pending_at: null, catalog_sync_error: 'Reconnect Shopify.' },
    )
    c = byProvider(await getPageIntegrationConnections('pg1', 'o1'))
    expect(c.shopify).toMatchObject({ syncStatus: 'attention', syncError: 'Reconnect Shopify.' })
  })

  it('includes Square + Acuity as token providers (connected reflects the stored blob)', async () => {
    drive({ calendly_pat_encrypted: null, shopify_credentials_encrypted: null, square_credentials_encrypted: 'v1.sq', acuity_credentials_encrypted: null, calendly_synced_at: null }, null)
    const c = byProvider(await getPageIntegrationConnections('pg1', 'o1'))
    expect(c.square).toMatchObject({ connected: true, kind: 'token', canSync: true })
    expect(c.acuity).toMatchObject({ connected: false, kind: 'token', canSync: true })
  })
})
