import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../test/supabase-mock'

const h = vi.hoisted(() => ({
  configured: true,
  calendlyPat: 'pat' as string | null,
  shopifyCreds: { shop: 'acme.myshopify.com', token: 'shpat_x' } as { shop: string; token: string } | null,
  imported: { ok: true, offers: [] as any[], note: 'n' } as any,
  busy: [] as any,
  page: { id: 'pg1', slug: 'acme', services: [] as any[], next_available: null } as any,
  pagesUpdate: null as any,
  secretsUpdate: null as any,
}))

vi.mock('./integration-importers', () => ({ importIntegrationOffers: async () => h.imported }))
vi.mock('./page-integration-credentials', () => ({
  integrationCredentialsConfigured: () => h.configured,
  getCalendlyPat: async () => h.calendlyPat,
  getShopifyCreds: async () => h.shopifyCreds,
}))
vi.mock('./calendly-write', () => ({ fetchCalendlyBusy: async () => h.busy }))
vi.mock('../observability', () => ({ captureEvent: vi.fn() }))

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
    h.shopifyCreds = { shop: 'acme.myshopify.com', token: 'shpat_x' }
    h.imported = { ok: true, offers: [calOffer()], note: 'Imported 1' }
    h.busy = [{ start: '2026-07-08T14:00:00Z', end: '2026-07-08T15:00:00Z' }]
    h.page = { id: 'pg1', slug: 'acme', services: [{ name: 'Existing', price: '$99', description: '', url: '' }], next_available: null }
    h.pagesUpdate = null
    h.secretsUpdate = null
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

  it('shopify: imports offers, NO availability, NO calendly cursor stamp', async () => {
    h.imported = { ok: true, offers: [shopOffer()], note: 'Imported 1' }
    const r = await syncPageIntegration(admin(), 'shopify', 'pg1')
    expect(r).toMatchObject({ ok: true, provider: 'shopify', imported: 1, availabilitySynced: false })
    expect(h.pagesUpdate.services.find((o: any) => o.name === 'Existing')).toBeTruthy()
    expect(h.pagesUpdate.services.find((o: any) => o.name === 'Mug').source).toBe('shopify')
    expect('next_available' in h.pagesUpdate).toBe(false)
    expect(h.secretsUpdate).toBeNull() // shopify doesn't touch the calendly cursor
  })

  it('calendly: preserves a hand-written availability note', async () => {
    h.page.next_available = 'Booking paused until August'
    await syncPageIntegration(admin(), 'calendly', 'pg1')
    expect('next_available' in h.pagesUpdate).toBe(false)
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
