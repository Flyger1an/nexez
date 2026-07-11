import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  importCalendlyOffers,
  importShopifyOffers,
  importIntegrationOffers,
  resolveShopDomain,
  gateIntegrationImport,
} from './integration-importers'

// Mock the platform integration mappers used by square/acuity so we test the
// fetch/dispatch wiring, not the (separately-tested) mappers.
vi.mock('../integrations', () => ({
  mapSquareCatalogToOffers: (objs: unknown[]) => (objs.length ? [{ name: 'Square Item', description: '', price: '$95', url: '', source: 'square' }] : []),
  mapAcuityTypesToOffers: (types: unknown[]) => (types.length ? [{ name: 'Acuity Session', description: '', price: '$250', url: '', source: 'acuity' }] : []),
}))
// The gate's collaborators — controllable per test.
const { gateRef } = vi.hoisted(() => ({ gateRef: { access: null as any, allows: true } }))
vi.mock('./page-access', () => ({ resolveFeatureOwner: vi.fn(async () => gateRef.access) }))
vi.mock('./plan', () => ({ ownerAllows: vi.fn(async () => gateRef.allows) }))
vi.mock('../../utils/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({})) }))

const jsonResponse = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body }) as any

beforeEach(() => {
  gateRef.access = { ok: true, ownerId: 'owner-1', scoped: false }
  gateRef.allows = true
})
afterEach(() => vi.unstubAllGlobals())

describe('resolveShopDomain (SSRF pin)', () => {
  it('accepts a real *.myshopify.com and appends the suffix to a bare handle', () => {
    expect(resolveShopDomain('acme.myshopify.com')).toBe('acme.myshopify.com')
    expect(resolveShopDomain('acme')).toBe('acme.myshopify.com')
  })
  it('rejects spoofed / off-domain hosts', () => {
    expect(resolveShopDomain('evil.com/x#.myshopify.com')).toBeNull()
    expect(resolveShopDomain('https://evil.com')).toBeNull()
    expect(resolveShopDomain('acme.myshopify.com.evil.com')).toBeNull()
  })
})

describe('importCalendlyOffers', () => {
  it('maps active event types to bookable offers + legacy lines', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ resource: { uri: 'https://api.calendly.com/users/U1' } }))
      .mockResolvedValueOnce(jsonResponse({
        collection: [{ attributes: { name: 'Intro Call', slug: 'intro', duration: 30, kind: 'solo', active: true }, relationships: { scheduling_url: { href: 'https://calendly.com/acme/intro' } } }],
      })))
    const r = await importCalendlyOffers('cal_tok')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.offers).toHaveLength(1)
    expect(r.offers[0]).toMatchObject({ name: 'Intro Call', price: 'Custom', source: 'calendly', duration: '30 min' })
    expect(r.lines?.[0]).toContain('Intro Call | Custom')
  })

  it('captures the event-type URI (for single-use links) from the real v2 top-level shape', async () => {
    // Calendly's v2 event_types returns fields at the resource top level (uri,
    // name, duration, scheduling_url) — NOT nested under attributes/relationships.
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ resource: { uri: 'https://api.calendly.com/users/U1' } }))
      .mockResolvedValueOnce(jsonResponse({
        collection: [{ uri: 'https://api.calendly.com/event_types/GBGGGGGG', name: 'Strategy Call', duration: 45, kind: 'solo', active: true, scheduling_url: 'https://calendly.com/acme/strategy' }],
      })))
    const r = await importCalendlyOffers('cal_tok')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.offers[0]).toMatchObject({
      name: 'Strategy Call',
      duration: '45 min',
      url: 'https://calendly.com/acme/strategy',
      source: 'calendly',
      metadata: { calendly_event_type: 'https://api.calendly.com/event_types/GBGGGGGG' },
    })
  })

  it('omits the event-type metadata when the URI is absent (legacy shape → single-use falls back)', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ resource: { uri: 'u' } }))
      .mockResolvedValueOnce(jsonResponse({
        collection: [{ attributes: { name: 'Intro Call', duration: 30, kind: 'solo', active: true }, relationships: { scheduling_url: { href: 'https://calendly.com/acme/intro' } } }],
      })))
    const r = await importCalendlyOffers('tok')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.offers[0]!.metadata?.calendly_event_type).toBeUndefined()
  })

  it('an invalid token is an error, not empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({}, false, 401)))
    const r = await importCalendlyOffers('bad')
    expect(r).toMatchObject({ ok: false, status: 401 })
  })

  it('a permission failure on event-types surfaces upstream status (body never reflected)', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ resource: { uri: 'u' } }))
      .mockResolvedValueOnce(jsonResponse({ secret: 'leak' }, false, 403)))
    const r = await importCalendlyOffers('tok')
    expect(r).toMatchObject({ ok: false, status: 502, upstreamStatus: 403 })
    expect(JSON.stringify(r)).not.toContain('leak')
  })

  it('no active event types is an OK-but-empty result', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ resource: { uri: 'u' } }))
      .mockResolvedValueOnce(jsonResponse({ collection: [] })))
    const r = await importCalendlyOffers('tok')
    expect(r).toMatchObject({ ok: true, offers: [] })
  })
})

describe('importShopifyOffers', () => {
  it('rejects an invalid store domain before any fetch', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    const r = await importShopifyOffers({ shop: 'evil.com', accessToken: 't' })
    expect(r).toMatchObject({ ok: false, status: 400 })
    expect(spy).not.toHaveBeenCalled()
  })

  it('maps products (first variant → price, extra variants → tiers)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      products: [{ title: 'Tee', body_html: '<p>Soft</p>', handle: 'tee', variants: [{ price: '20.00', title: 'S' }, { price: '22.00', title: 'L' }] }],
    }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await importShopifyOffers({ shop: 'acme.myshopify.com', accessToken: 't' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(fetchMock.mock.calls[0][0]).toContain('/admin/api/2026-07/products.json')
    expect(r.offers[0]).toMatchObject({ name: 'Tee', price: '$20', source: 'shopify' })
    expect(r.offers[0].tiers).toHaveLength(2)
  })

  it('an upstream non-2xx is a 502 that never reflects the body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({ secret: 'leak' }, false, 401)))
    const r = await importShopifyOffers({ shop: 'acme.myshopify.com', accessToken: 't' })
    expect(r).toMatchObject({ ok: false, status: 502, upstreamStatus: 401 })
    expect(JSON.stringify(r)).not.toContain('leak')
  })
})

describe('importIntegrationOffers (intake dispatcher — real offers or error, never sample)', () => {
  it('square: a live catalog maps to offers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({ objects: [{ id: 'x' }] })))
    const r = await importIntegrationOffers({ provider: 'square', accessToken: 't' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.offers[0].name).toBe('Square Item')
  })

  it('square: an unreachable catalog is an error (no sample fallback)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({}, false, 401)))
    const r = await importIntegrationOffers({ provider: 'square', accessToken: 't' })
    expect(r).toMatchObject({ ok: false, status: 502 })
  })

  it('acuity: a live account maps to offers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse([{ id: 1 }])))
    const r = await importIntegrationOffers({ provider: 'acuity', userId: 'u', apiKey: 'k' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.offers[0].name).toBe('Acuity Session')
  })
})

describe('gateIntegrationImport', () => {
  const user = { id: 'u1', email: 'x@y.com', email_confirmed_at: '2026-01-01' }
  it('403/503 when the effective owner cannot be resolved', async () => {
    gateRef.access = { ok: false, status: 403 }
    expect(await gateIntegrationImport({ supabase: {} as any, user, proMessage: 'pro' })).toMatchObject({ ok: false, status: 403 })
    gateRef.access = { ok: false, status: 503 }
    expect((await gateIntegrationImport({ supabase: {} as any, user, proMessage: 'pro' })) as any).toMatchObject({ ok: false, status: 503 })
  })
  it('402 with the caller proMessage when the owner lacks integrations', async () => {
    gateRef.allows = false
    expect(await gateIntegrationImport({ supabase: {} as any, user, proMessage: 'Upgrade please' })).toEqual({ ok: false, status: 402, error: 'Upgrade please' })
  })
  it('ok with the resolved ownerId when entitled', async () => {
    expect(await gateIntegrationImport({ supabase: {} as any, user, proMessage: 'pro' })).toEqual({ ok: true, ownerId: 'owner-1' })
  })
})
