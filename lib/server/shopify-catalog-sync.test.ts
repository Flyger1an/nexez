import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock } from '../../test/supabase-mock'

const h = vi.hoisted(() => ({
  credentials: { shop: 'demo.myshopify.com', accessToken: 'token' } as { shop: string; accessToken: string } | null,
  syncResult: { ok: true, provider: 'shopify', imported: 2, windows: 0, availabilitySynced: false, note: 'ok' } as any,
  syncError: null as Error | null,
  integrationsAllowed: true,
}))

vi.mock('./integration-sync', () => ({
  syncPageIntegration: vi.fn(async () => {
    if (h.syncError) throw h.syncError
    return h.syncResult
  }),
}))
vi.mock('./shopify-install', () => ({ getShopifyInstallCredentialsByShop: vi.fn(async () => h.credentials) }))
vi.mock('./plan', () => ({ ownerAllows: vi.fn(async () => h.integrationsAllowed) }))
vi.mock('../observability', () => ({ captureEvent: vi.fn() }))

import { processPendingShopifyCatalogSyncs, queueShopifyCatalogSync } from './shopify-catalog-sync'
import { syncPageIntegration } from './integration-sync'
import { getShopifyInstallCredentialsByShop } from './shopify-install'
import { ownerAllows } from './plan'

const pendingJob: {
  shop_domain: string
  owner_id: string | null
  page_id: string | null
  catalog_sync_pending_at: string
  catalog_sync_attempted_at: string | null
  catalog_sync_attempts: number
  mapping_generation: number
  mapping_transition_token: string | null
} = {
  shop_domain: 'demo.myshopify.com',
  owner_id: 'owner-1',
  page_id: 'page-1',
  catalog_sync_pending_at: '2026-07-13T12:00:00.000Z',
  catalog_sync_attempted_at: null,
  catalog_sync_attempts: 0,
  mapping_generation: 3,
  mapping_transition_token: null,
}

function admin(updates: any[], jobs = [pendingJob]) {
  return createSupabaseMock((ctx) => {
    if (ctx.op === 'select') return { data: jobs, error: null }
    if (ctx.op === 'update') {
      updates.push(ctx.payload)
      const isClaim = Boolean(ctx.payload?.catalog_sync_attempted_at)
      return { data: isClaim ? { shop_domain: pendingJob.shop_domain } : null, error: null }
    }
    return { data: null, error: null }
  }) as any
}

describe('Shopify catalog sync queue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.credentials = { shop: 'demo.myshopify.com', accessToken: 'token' }
    h.syncResult = { ok: true, provider: 'shopify', imported: 2, windows: 0, availabilitySynced: false, note: 'ok' }
    h.syncError = null
    h.integrationsAllowed = true
  })

  it('debounces a catalog webhook into the installation row', async () => {
    const updates: any[] = []
    const db = createSupabaseMock((ctx) => {
      if (ctx.op === 'update') {
        updates.push(ctx.payload)
        return { data: { shop_domain: 'demo.myshopify.com' }, error: null }
      }
      return { data: null, error: null }
    })

    await expect(queueShopifyCatalogSync(db as any, 'demo.myshopify.com', 'products/update', '2026-07-13T12:00:00Z')).resolves.toBe(true)
    expect(updates[0]).toMatchObject({
      catalog_sync_pending_at: '2026-07-13T12:00:00Z',
      catalog_sync_attempted_at: null,
      catalog_sync_attempts: 0,
      catalog_sync_error: null,
      catalog_sync_topic: 'products/update',
    })
  })

  it('claims and syncs using credentials for the exact webhook shop', async () => {
    const updates: any[] = []
    const result = await processPendingShopifyCatalogSyncs(admin(updates), 4)

    expect(result).toEqual({ queued: 1, claimed: 1, synced: 1, failed: 0, skipped: 0 })
    expect(getShopifyInstallCredentialsByShop).toHaveBeenCalledWith(expect.anything(), 'demo.myshopify.com')
    expect(syncPageIntegration).toHaveBeenCalledWith(expect.anything(), 'shopify', 'page-1', {
      shopifyCredentials: h.credentials,
      shopifyMapping: {
        shop: 'demo.myshopify.com',
        ownerId: 'owner-1',
        pageId: 'page-1',
        generation: 3,
      },
    })
    expect(updates.some((u) => u.catalog_sync_attempted_at && u.catalog_sync_attempts === 1)).toBe(true)
    expect(updates.at(-1)).toMatchObject({
      catalog_sync_pending_at: null,
      catalog_sync_attempts: 0,
      catalog_sync_error: null,
    })
  })

  it('requeues an unexpected importer exception instead of stranding the claimed job', async () => {
    h.syncError = new Error('Temporary Shopify transport failure.')
    const updates: any[] = []
    const result = await processPendingShopifyCatalogSyncs(admin(updates), 4)

    expect(result).toMatchObject({ claimed: 1, synced: 0, failed: 1 })
    expect(updates.at(-1)).toMatchObject({
      catalog_sync_attempted_at: null,
      catalog_sync_error: 'Shopify catalog sync hit a temporary problem. Nexez will retry automatically.',
    })
    expect(updates.at(-1).catalog_sync_pending_at).toEqual(expect.any(String))
  })

  it('keeps installed-app webhook sync running after an integrations downgrade', async () => {
    h.integrationsAllowed = false
    const updates: any[] = []

    const result = await processPendingShopifyCatalogSyncs(admin(updates), 4)

    expect(result).toEqual({ queued: 1, claimed: 1, synced: 1, failed: 0, skipped: 0 })
    expect(getShopifyInstallCredentialsByShop).toHaveBeenCalled()
    expect(syncPageIntegration).toHaveBeenCalled()
    expect(ownerAllows).not.toHaveBeenCalled()
    expect(updates.at(-1)).toMatchObject({
      catalog_sync_pending_at: null,
      catalog_sync_attempts: 0,
      catalog_sync_error: null,
    })
  })

  it('requeues transient upstream failures and retains a safe attention message', async () => {
    h.syncResult = { ok: false, status: 502, error: 'Shopify rejected the catalog request.' }
    const updates: any[] = []
    const result = await processPendingShopifyCatalogSyncs(admin(updates), 4)

    expect(result.failed).toBe(1)
    const failure = updates.find((u) => u.catalog_sync_error)
    expect(failure.catalog_sync_pending_at).toEqual(expect.any(String))
    expect(failure.catalog_sync_error).toBe('Shopify rejected the catalog request.')
  })

  it('requeues an optimistic page-write conflict for a fresh merge', async () => {
    h.syncResult = { ok: false, status: 409, error: 'This page changed during the sync.' }
    const updates: any[] = []
    const result = await processPendingShopifyCatalogSyncs(admin(updates), 4)

    expect(result.failed).toBe(1)
    expect(updates.find((u) => u.catalog_sync_error)).toMatchObject({
      catalog_sync_error: 'This page changed during the sync.',
      catalog_sync_attempted_at: null,
    })
  })

  it('fails closed when a queued installation is no longer linked', async () => {
    const updates: any[] = []
    const result = await processPendingShopifyCatalogSyncs(admin(updates, [{ ...pendingJob, owner_id: null }]), 4)

    expect(result).toMatchObject({ claimed: 1, synced: 0, failed: 1 })
    expect(syncPageIntegration).not.toHaveBeenCalled()
    expect(updates.find((u) => u.catalog_sync_error)?.catalog_sync_pending_at).toBeNull()
  })

  it('does not claim or sync a job whose mapping transition is active', async () => {
    const updates: any[] = []
    const result = await processPendingShopifyCatalogSyncs(
      admin(updates, [{ ...pendingJob, mapping_transition_token: 'lease-1' }]),
      4,
    )

    expect(result).toMatchObject({ claimed: 0, synced: 0, failed: 0, skipped: 1 })
    expect(getShopifyInstallCredentialsByShop).not.toHaveBeenCalled()
    expect(syncPageIntegration).not.toHaveBeenCalled()
  })
})
