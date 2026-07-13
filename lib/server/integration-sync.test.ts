import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../test/supabase-mock'

const h = vi.hoisted(() => ({
  configured: true,
  calendlyPat: 'pat' as string | null,
  installedShopify: null as { shop: string; accessToken: string } | null,
  shopifyCreds: { shop: 'acme.myshopify.com', token: 'shpat_x' } as { shop: string; token: string } | null,
  squareCreds: { accessToken: 'sq_x' } as { accessToken: string } | null,
  acuityCreds: { userId: 'u', apiKey: 'k' } as { userId: string; apiKey: string } | null,
  imported: { ok: true, offers: [] as any[], note: 'n' } as any,
  importInput: null as any,
  busy: [] as any,
  page: { id: 'pg1', slug: 'acme', services: [] as any[], next_available: null } as any,
  pagesUpdate: null as any,
  secretsUpdate: null as any,
  shopifySyncedAt: null as string | null,
}))

vi.mock('./integration-importers', () => ({ importIntegrationOffers: async (input: any) => { h.importInput = input; return h.imported } }))
vi.mock('./page-integration-credentials', () => ({
  integrationCredentialsConfigured: () => h.configured,
  getCalendlyPat: async () => h.calendlyPat,
  getShopifyCreds: async () => h.shopifyCreds,
  getSquareCreds: async () => h.squareCreds,
  getAcuityCreds: async () => h.acuityCreds,
}))
vi.mock('./calendly-write', () => ({ fetchCalendlyBusy: async () => h.busy }))
vi.mock('../observability', () => ({ captureEvent: vi.fn() }))
vi.mock('./shopify-install', () => ({
  getShopifyInstallCredentials: async () => h.installedShopify,
  markShopifySynced: async (_admin: unknown, _pageId: string, at: string) => { h.shopifySyncedAt = at },
}))

import { syncPageIntegration } from './integration-sync'

function admin() {
  return createSupabaseMock((ctx: any) => {
    if (ctx.table === 'pages' && ctx.op === 'select') return { data: h.page, error: null }
    if (ctx.table === 'pages' && ctx.op === 'update') { h.pagesUpdate = ctx.payload; return { data: null, error: null } }
    if (ctx.table === 'page_secrets' && ctx.op === 'update') { h.secretsUpdate = ctx.payload; return { data: null, error: null } }
    return { data: null, error: null }
  }) as any
}

const calOffer = () => ({ name: '30 Minute Meeting', description: '', price: 'Custom', url: 'https://calendly.com/acme/30min', source: 'calendly', metadata: { calendly_event_type: 'https://api.calendly.com/event_types/GB' } })
const shopOffer = () => ({ name: 'Mug', description: '', price: '$12', url: 'https://acme.myshopify.com/mug', source: 'shopify' })

describe('syncPageIntegration', () => {
  beforeEach(() => {
    h.configured = true
    h.calendlyPat = 'pat'
    h.installedShopify = null
    h.shopifyCreds = { shop: 'acme.myshopify.com', token: 'shpat_x' }
    h.imported = { ok: true, offers: [calOffer()], note: 'Imported 1' }
    h.importInput = null
    h.busy = [{ start: '2026-07-08T14:00:00Z', end: '2026-07-08T15:00:00Z' }]
    h.page = { id: 'pg1', slug: 'acme', services: [{ name: 'Existing', price: '$99', description: '', url: '' }], next_available: null }
    h.pagesUpdate = null
    h.secretsUpdate = null
    h.shopifySyncedAt = null
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

  it('calendly: imports offers (preserving existing), syncs availability windows + stamps the cursor', async () => {
    const r = await syncPageIntegration(admin(), 'calendly', 'pg1')
    expect(r).toMatchObject({ ok: true, provider: 'calendly', imported: 1, availabilitySynced: true })
    expect((r as any).windows).toBeGreaterThan(0)
    expect(h.pagesUpdate.services.find((o: any) => o.name === 'Existing')).toBeTruthy() // preserved
    expect(h.pagesUpdate.services.find((o: any) => o.name === '30 Minute Meeting').metadata.calendly_event_type).toBeTruthy()
    expect(h.pagesUpdate.next_available).toContain('||WINDOWS||')
    expect(h.secretsUpdate.calendly_synced_at).toBeTruthy()
  })

  it('shopify: prefers the installed OAuth credential and records the successful sync', async () => {
    h.installedShopify = { shop: 'oauth-shop.myshopify.com', accessToken: 'oauth-token' }
    h.shopifyCreds = null
    h.imported = { ok: true, offers: [shopOffer()], note: 'Imported 1' }
    const r = await syncPageIntegration(admin(), 'shopify', 'pg1')
    expect(r).toMatchObject({ ok: true, provider: 'shopify', imported: 1, availabilitySynced: false })
    expect(h.pagesUpdate.services.find((o: any) => o.name === 'Existing')).toBeTruthy()
    expect(h.pagesUpdate.products.find((o: any) => o.name === 'Mug').source).toBe('shopify')
    expect(h.pagesUpdate.services.find((o: any) => o.name === 'Mug')).toBeUndefined()
    expect('next_available' in h.pagesUpdate).toBe(false)
    expect(h.secretsUpdate).toBeNull() // shopify doesn't touch the calendly cursor
    expect(h.shopifySyncedAt).toBeTruthy()
    expect(h.importInput).toEqual({ provider: 'shopify', shop: 'oauth-shop.myshopify.com', accessToken: 'oauth-token' })
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

  it('acuity: 400 when not connected for the page', async () => {
    h.acuityCreds = null
    expect(await syncPageIntegration(admin(), 'acuity', 'pg1')).toMatchObject({ ok: false, status: 400 })
  })

  it('updates a provider offer that already lives in products — no cross-column duplicate', async () => {
    h.imported = { ok: true, offers: [shopOffer()], note: 'Imported 1' } // "Mug"
    h.page = { id: 'pg1', slug: 'acme', services: [], products: [{ name: 'Mug', price: '$10', description: '', url: 'https://old', source: 'shopify' }], next_available: null }
    const r = await syncPageIntegration(admin(), 'shopify', 'pg1')
    expect(r.ok).toBe(true)
    expect(h.pagesUpdate.products.filter((o: any) => o.name === 'Mug')).toHaveLength(1) // refreshed in products
    expect((h.pagesUpdate.services ?? []).find((o: any) => o.name === 'Mug')).toBeUndefined() // not duplicated to services
  })
})
