import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../test/supabase-mock'

const h = vi.hoisted(() => ({
  configured: true,
  calendlyPat: 'pat' as string | null,
  shopifyCreds: { shop: 'acme.myshopify.com', token: 'shpat_x' } as { shop: string; token: string } | null,
  squareCreds: { accessToken: 'sq_x' } as { accessToken: string } | null,
  acuityCreds: { userId: 'u', apiKey: 'k' } as { userId: string; apiKey: string } | null,
  imported: { ok: true, offers: [] as any[], note: 'n' } as any,
  importInput: null as any,
  availability: null as any,
  page: { id: 'pg1', slug: 'acme', services: [] as any[], next_available: null } as any,
  pagesUpdate: null as any,
  secretsUpdate: null as any,
  shopifyCommitResult: 'written' as 'written' | 'mapping_stale' | 'page_conflict',
  shopifyCommitInput: null as any,
  pagesWriteConflict: false,
  managedCredentials: {} as Record<string, any>,
  connectorSyncRecords: [] as Array<{ pageId: string; provider: string; input: any }>,
}))

vi.mock('./integration-importers', () => ({ importIntegrationOffers: async (input: any) => { h.importInput = input; return h.imported } }))
vi.mock('./page-integration-credentials', () => ({
  integrationCredentialsConfigured: () => h.configured,
  getShopifyCreds: async () => h.shopifyCreds,
  getSquareCreds: async () => h.squareCreds,
  getAcuityCreds: async () => h.acuityCreds,
}))
vi.mock('./calendly-credentials', () => ({
  getCalendlyCredential: async () => {
    const oauth = h.managedCredentials.calendly
    if (oauth?.accessToken) return { accessToken: oauth.accessToken, source: 'oauth' }
    return h.calendlyPat ? { accessToken: h.calendlyPat, source: 'personal_token' } : null
  },
}))
vi.mock('./calendly-write', () => ({ fetchCalendlyEventTypeAvailability: async () => h.availability }))
vi.mock('../observability', () => ({ captureEvent: vi.fn() }))
vi.mock('./shopify-install', () => ({
  commitShopifyCatalogSync: async (_admin: unknown, input: unknown) => {
    h.shopifyCommitInput = input
    return h.shopifyCommitResult
  },
}))
vi.mock('./merchant-connectors', () => ({
  getUsableConnectorCredential: async (_admin: unknown, _pageId: string, provider: string) => {
    const credential = h.managedCredentials[provider]
    return credential ? { ok: true, credential, row: {} } : { ok: false, error: 'Not connected' }
  },
  isManagedConnectorProvider: (provider: string) => ['calendly', 'square', 'acuity', 'google_calendar', 'woocommerce', 'servicem8'].includes(provider),
  recordMerchantConnectorSync: async (_admin: unknown, pageId: string, provider: string, input: any) => {
    h.connectorSyncRecords.push({ pageId, provider, input })
  },
}))

import { syncPageIntegration } from './integration-sync'

function admin() {
  return createSupabaseMock((ctx: any) => {
    if (ctx.table === 'pages' && ctx.op === 'select') return { data: h.page, error: null }
    if (ctx.table === 'pages' && ctx.op === 'update') {
      h.pagesUpdate = ctx.payload
      return { data: h.pagesWriteConflict ? null : { id: 'pg1' }, error: null }
    }
    if (ctx.table === 'page_secrets' && ctx.op === 'update') { h.secretsUpdate = ctx.payload; return { data: null, error: null } }
    return { data: null, error: null }
  }) as any
}

const calOffer = () => ({ name: '30 Minute Meeting', description: '', price: 'Custom', url: 'https://calendly.com/acme/30min', duration: '30 min', source: 'calendly', metadata: { calendly_event_type: 'https://api.calendly.com/event_types/GB' } })
const openAvailability = () => ({
  windows: [{ date: '2026-07-08', start: '10:00', end: '10:30', label: 'Wed 10:00 AM CDT–10:30 AM CDT', time_zone: 'America/Chicago' }],
  availabilityByEventType: { 'https://api.calendly.com/event_types/GB': 'available' },
  complete: true,
  timeZone: 'America/Chicago',
})
const shopOffer = () => ({ name: 'Mug', description: '', price: '$12', url: 'https://acme.myshopify.com/mug', source: 'shopify' })

describe('syncPageIntegration', () => {
  beforeEach(() => {
    h.configured = true
    h.calendlyPat = 'pat'
    h.shopifyCreds = { shop: 'acme.myshopify.com', token: 'shpat_x' }
    h.imported = { ok: true, offers: [calOffer()], note: 'Imported 1' }
    h.importInput = null
    h.availability = openAvailability()
    h.page = { id: 'pg1', slug: 'acme', services: [{ name: 'Existing', price: '$99', description: '', url: '' }], next_available: null, updated_at: '2026-07-13T12:00:00Z' }
    h.pagesUpdate = null
    h.secretsUpdate = null
    h.shopifyCommitResult = 'written'
    h.shopifyCommitInput = null
    h.pagesWriteConflict = false
    h.managedCredentials = {}
    h.connectorSyncRecords = []
  })

  it('503 when credential storage is not configured (dormant)', async () => {
    h.configured = false
    expect(await syncPageIntegration(admin(), 'calendly', 'pg1')).toMatchObject({ ok: false, status: 503 })
  })

  it('400 when the provider is not connected for the page', async () => {
    h.calendlyPat = null
    expect(await syncPageIntegration(admin(), 'calendly', 'pg1')).toMatchObject({ ok: false, status: 400 })
    h.shopifyCreds = null
    expect(await syncPageIntegration(admin(), 'shopify', 'pg1')).toMatchObject({ ok: false, status: 400 })
  })

  it('502 when the live import fails (never partial)', async () => {
    h.imported = { ok: false, status: 502, error: 'Calendly rejected the request' }
    expect(await syncPageIntegration(admin(), 'calendly', 'pg1')).toMatchObject({ ok: false, status: 502 })
    expect(h.pagesUpdate).toBeNull() // nothing written
  })

  it('returns a retryable conflict instead of overwriting a page edited during sync', async () => {
    h.pagesWriteConflict = true
    const result = await syncPageIntegration(admin(), 'shopify', 'pg1')

    expect(result).toMatchObject({ ok: false, status: 409 })
    expect(h.shopifyCommitInput).toBeNull()
  })

  it('calendly: imports offers (preserving existing), syncs availability windows + stamps the cursor', async () => {
    const r = await syncPageIntegration(admin(), 'calendly', 'pg1')
    expect(r).toMatchObject({ ok: true, provider: 'calendly', imported: 1, availabilitySynced: true })
    expect((r as any).windows).toBeGreaterThan(0)
    expect(h.pagesUpdate.services.find((o: any) => o.name === 'Existing')).toBeTruthy() // preserved
    expect(h.pagesUpdate.services.find((o: any) => o.name === '30 Minute Meeting').metadata.calendly_event_type).toBeTruthy()
    expect(h.pagesUpdate.next_available).toContain('||WINDOWS||')
    expect(h.secretsUpdate.calendly_synced_at).toBeTruthy()
  })

  it('calendly: prefers the managed OAuth credential over a retained personal token', async () => {
    h.managedCredentials.calendly = {
      accessToken: 'calendly-oauth',
      refreshToken: 'calendly-refresh',
      tokenType: 'Bearer',
      expiresAt: null,
    }
    h.calendlyPat = 'legacy-personal-token'

    const result = await syncPageIntegration(admin(), 'calendly', 'pg1')

    expect(result.ok).toBe(true)
    expect(h.importInput).toEqual({ provider: 'calendly', token: 'calendly-oauth' })
    expect(h.connectorSyncRecords.at(-1)).toMatchObject({ pageId: 'pg1', provider: 'calendly', input: { ok: true } })
  })

  it('shopify: commits an installed OAuth sync under the exact mapping generation', async () => {
    h.shopifyCreds = null
    h.imported = { ok: true, offers: [shopOffer()], note: 'Imported 1' }
    const mapping = { shop: 'oauth-shop.myshopify.com', ownerId: 'owner-1', pageId: 'pg1', generation: 7 }
    const credentials = { shop: mapping.shop, accessToken: 'oauth-token' }
    const r = await syncPageIntegration(admin(), 'shopify', 'pg1', {
      shopifyCredentials: credentials,
      shopifyMapping: mapping,
      shopifyChannelHandle: 'nexez-pg1',
      clearShopifyCatalogSyncState: true,
    })
    expect(r).toMatchObject({ ok: true, provider: 'shopify', imported: 1, availabilitySynced: false })
    expect(h.pagesUpdate).toBeNull()
    expect(h.secretsUpdate).toBeNull() // shopify doesn't touch the calendly cursor
    expect(h.shopifyCommitInput).toMatchObject({
      mapping,
      expectedPageUpdatedAt: '2026-07-13T12:00:00Z',
      clearCatalogSyncState: true,
      services: expect.arrayContaining([expect.objectContaining({ name: 'Existing' })]),
      products: expect.arrayContaining([expect.objectContaining({ name: 'Mug', source: 'shopify' })]),
    })
    expect(h.importInput).toEqual({
      provider: 'shopify',
      shop: 'oauth-shop.myshopify.com',
      accessToken: 'oauth-token',
      limit: 250,
      channelHandle: 'nexez-pg1',
    })
  })

  it('never falls back to a manual token when an installed credential lacks its mapping proof', async () => {
    h.shopifyCreds = { shop: 'manual.myshopify.com', token: 'manual-token' }
    const result = await syncPageIntegration(admin(), 'shopify', 'pg1', {
      shopifyCredentials: { shop: 'oauth.myshopify.com', accessToken: 'oauth-token' },
    })

    expect(result).toMatchObject({ ok: false, status: 409 })
    expect(h.importInput).toBeNull()
    expect(h.pagesUpdate).toBeNull()
  })

  it('refuses an installed sync without the exact channel handle', async () => {
    const mapping = { shop: 'oauth.myshopify.com', ownerId: 'owner-1', pageId: 'pg1', generation: 7 }

    const result = await syncPageIntegration(admin(), 'shopify', 'pg1', {
      shopifyCredentials: { shop: mapping.shop, accessToken: 'oauth-token' },
      shopifyMapping: mapping,
    })

    expect(result).toMatchObject({ ok: false, status: 409 })
    expect((result as { error: string }).error).toMatch(/sales channel needs to be repaired/i)
    expect(h.importInput).toBeNull()
  })

  it('rejects an in-flight installed sync after a relink generation wins the race', async () => {
    h.shopifyCreds = null
    h.imported = { ok: true, offers: [shopOffer()], note: 'Imported 1' }
    h.shopifyCommitResult = 'mapping_stale'
    const mapping = { shop: 'oauth.myshopify.com', ownerId: 'owner-1', pageId: 'pg1', generation: 7 }

    const result = await syncPageIntegration(admin(), 'shopify', 'pg1', {
      shopifyCredentials: { shop: mapping.shop, accessToken: 'oauth-token' },
      shopifyMapping: mapping,
      shopifyChannelHandle: 'nexez-pg1',
    })

    expect(result).toMatchObject({ ok: false, status: 409 })
    expect((result as { error: string }).error).toMatch(/connection changed during sync/i)
    expect(h.pagesUpdate).toBeNull()
  })

  it('calendly: preserves a hand-written availability note', async () => {
    h.page.next_available = 'Booking paused until August'
    await syncPageIntegration(admin(), 'calendly', 'pg1')
    expect('next_available' in h.pagesUpdate).toBe(false)
  })

  it('square: imports catalog offers from stored creds (no availability, no cursor stamp)', async () => {
    h.imported = { ok: true, offers: [{ name: 'Latte', description: '', price: '$5', url: '', source: 'square' }], note: 'Imported 1' }
    const r = await syncPageIntegration(admin(), 'square', 'pg1')
    expect(r).toMatchObject({ ok: true, provider: 'square', imported: 1, availabilitySynced: false })
    expect(h.pagesUpdate.services.find((o: any) => o.name === 'Latte').source).toBe('square')
    expect(h.secretsUpdate).toBeNull()
  })

  it('square: prefers the OAuth connection over a retained legacy access token', async () => {
    h.managedCredentials.square = { accessToken: 'square-oauth', refreshToken: 'refresh', tokenType: 'Bearer', expiresAt: null }
    h.squareCreds = { accessToken: 'legacy-token' }
    h.imported = { ok: true, offers: [], note: 'Imported 0', connectionMetadata: { bookingApiReadable: true } }

    const result = await syncPageIntegration(admin(), 'square', 'pg1')

    expect(result.ok).toBe(true)
    expect(h.importInput).toEqual({ provider: 'square', accessToken: 'square-oauth' })
    expect(h.connectorSyncRecords).toContainEqual({
      pageId: 'pg1',
      provider: 'square',
      input: { ok: true, metadata: { bookingApiReadable: true } },
    })
  })

  it('woocommerce: syncs through the managed credential without pruning offers omitted by the provider response', async () => {
    h.managedCredentials.woocommerce = { siteUrl: 'https://shop.example.com', consumerKey: 'ck', consumerSecret: 'cs' }
    h.imported = {
      ok: true,
      offers: [{ name: 'Current Woo product', description: '', price: '$25', url: '', source: 'woocommerce' }],
      note: 'Imported 1',
      catalogComplete: true,
      connectionMetadata: { ordersReadable: true },
    }
    h.page = {
      id: 'pg1',
      slug: 'acme',
      services: [
        { name: 'Manual service', description: '', price: '$10', url: '' },
        { name: 'Older Woo product', description: '', price: '$20', url: '', source: 'woocommerce' },
      ],
      products: [],
      next_available: null,
      updated_at: '2026-07-13T12:00:00Z',
    }

    const result = await syncPageIntegration(admin(), 'woocommerce', 'pg1')

    expect(result).toMatchObject({ ok: true, provider: 'woocommerce', imported: 1 })
    expect(h.importInput).toEqual({ provider: 'woocommerce', credentials: h.managedCredentials.woocommerce })
    expect(h.pagesUpdate.services.map((offer: any) => offer.name)).toEqual([
      'Manual service',
      'Older Woo product',
      'Current Woo product',
    ])
    expect(h.connectorSyncRecords.at(-1)).toEqual({
      pageId: 'pg1',
      provider: 'woocommerce',
      input: { ok: true, metadata: { ordersReadable: true } },
    })
  })

  it('servicem8: records attention without writing page data when the upstream read fails', async () => {
    h.managedCredentials.servicem8 = { accessToken: 'sm8', refreshToken: 'refresh', tokenType: 'Bearer', expiresAt: null }
    h.imported = { ok: false, status: 502, error: 'ServiceM8 rejected read_jobs' }

    const result = await syncPageIntegration(admin(), 'servicem8', 'pg1')

    expect(result).toMatchObject({ ok: false, status: 502 })
    expect(h.importInput).toEqual({ provider: 'servicem8', accessToken: 'sm8' })
    expect(h.pagesUpdate).toBeNull()
    expect(h.connectorSyncRecords).toEqual([{
      pageId: 'pg1',
      provider: 'servicem8',
      input: { ok: false, error: 'ServiceM8 rejected read_jobs' },
    }])
  })

  it('acuity: 400 when not connected for the page', async () => {
    h.acuityCreds = null
    expect(await syncPageIntegration(admin(), 'acuity', 'pg1')).toMatchObject({ ok: false, status: 400 })
  })

  it('acuity: prefers the managed OAuth credential over retained Basic credentials', async () => {
    h.managedCredentials.acuity = { accessToken: 'acuity-oauth', refreshToken: null, tokenType: 'Bearer', expiresAt: null }
    h.acuityCreds = { userId: 'legacy-user', apiKey: 'legacy-key' }
    h.imported = { ok: true, offers: [], note: 'Imported 0' }

    const result = await syncPageIntegration(admin(), 'acuity', 'pg1')

    expect(result.ok).toBe(true)
    expect(h.importInput).toEqual({ provider: 'acuity', accessToken: 'acuity-oauth' })
    expect(h.connectorSyncRecords).toContainEqual({
      pageId: 'pg1',
      provider: 'acuity',
      input: { ok: true, metadata: undefined },
    })
  })

  it('updates a provider offer that already lives in products - no cross-column duplicate', async () => {
    h.imported = { ok: true, offers: [shopOffer()], note: 'Imported 1' } // "Mug"
    h.page = { id: 'pg1', slug: 'acme', services: [], products: [{ name: 'Mug', price: '$10', description: '', url: 'https://old', source: 'shopify' }], next_available: null, updated_at: '2026-07-13T12:00:00Z' }
    const r = await syncPageIntegration(admin(), 'shopify', 'pg1')
    expect(r.ok).toBe(true)
    expect(h.pagesUpdate.products.filter((o: any) => o.name === 'Mug')).toHaveLength(1) // refreshed in products
    expect((h.pagesUpdate.services ?? []).find((o: any) => o.name === 'Mug')).toBeUndefined() // not duplicated to services
  })

  it('shopify: removes products no longer present in the complete active catalog', async () => {
    h.imported = { ok: true, offers: [{
      ...shopOffer(),
      metadata: { shopify_product_id: 'p1', shopify_shop: 'acme.myshopify.com' },
    }], note: 'Imported 1', catalogComplete: true }
    h.page = {
      id: 'pg1',
      slug: 'acme',
      services: [],
      products: [
        { ...shopOffer(), metadata: { shopify_product_id: 'p1', shopify_shop: 'acme.myshopify.com' } },
        { ...shopOffer(), name: 'Deleted Tee', metadata: { shopify_product_id: 'p2', shopify_shop: 'acme.myshopify.com' } },
      ],
      next_available: null,
      updated_at: '2026-07-13T12:00:00Z',
    }

    const r = await syncPageIntegration(admin(), 'shopify', 'pg1')
    expect(r.ok).toBe(true)
    expect(h.pagesUpdate.products.map((offer: any) => offer.name)).toEqual(['Mug'])
  })

  it('shopify: never prunes unseen products from a capped catalog response', async () => {
    h.imported = { ok: true, offers: [{
      ...shopOffer(),
      metadata: { shopify_product_id: 'p1', shopify_shop: 'acme.myshopify.com' },
    }], note: 'Imported the first 1', catalogComplete: false }
    h.page = {
      id: 'pg1',
      slug: 'acme',
      services: [],
      products: [
        { ...shopOffer(), metadata: { shopify_product_id: 'p1', shopify_shop: 'acme.myshopify.com' } },
        { ...shopOffer(), name: 'Outside fetch window', metadata: { shopify_product_id: 'p2', shopify_shop: 'acme.myshopify.com' } },
      ],
      next_available: null,
      updated_at: '2026-07-13T12:00:00Z',
    }

    const r = await syncPageIntegration(admin(), 'shopify', 'pg1')
    expect(r.ok).toBe(true)
    expect(h.pagesUpdate.products.map((offer: any) => offer.name)).toEqual(['Mug', 'Outside fetch window'])
  })
})
