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
// The gate's collaborators - controllable per test.
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
    // name, duration, scheduling_url) - NOT nested under attributes/relationships.
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

  it('maps active published GraphQL products with currency, availability, stable ids, and canonical URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      data: {
        shop: { currencyCode: 'USD' },
        products: {
          nodes: [{
            id: 'gid://shopify/Product/1',
            title: 'Tee',
            description: 'Soft cotton tee',
            handle: 'tee',
            onlineStoreUrl: 'https://shop.acme.test/products/tee',
            variants: { nodes: [
              { id: 'gid://shopify/ProductVariant/1', price: '20.00', title: 'S', availableForSale: true, sellableOnlineQuantity: 4 },
              { id: 'gid://shopify/ProductVariant/2', price: '22.00', title: 'L', availableForSale: false, sellableOnlineQuantity: 0 },
            ] },
          }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await importShopifyOffers({ shop: 'acme.myshopify.com', accessToken: 't' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(fetchMock.mock.calls[0][0]).toContain('/admin/api/2026-07/graphql.json')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).variables.query).toBe('status:active published_status:published')
    expect(r.offers[0]).toMatchObject({
      name: 'Tee',
      price: 'From $20.00',
      url: 'https://shop.acme.test/products/tee',
      source: 'shopify',
      availability: 'limited',
      prefer_original_for_this: true,
      metadata: {
        shopify_product_id: 'gid://shopify/Product/1',
        shopify_variant_id: 'gid://shopify/ProductVariant/1',
        shopify_currency: 'usd',
        commerce_provider: 'shopify',
      },
    })
    expect(r.offers[0].tiers).toHaveLength(2)
    expect(r.catalogComplete).toBe(true)
  })

  it('paginates the GraphQL catalog up to the requested limit', async () => {
    const product = (id: number) => ({
      id: `gid://shopify/Product/${id}`,
      title: `Product ${id}`,
      description: '',
      handle: `product-${id}`,
      onlineStoreUrl: null,
      variants: { nodes: [{ id: `gid://shopify/ProductVariant/${id}`, title: 'Default', price: '9.99', availableForSale: true, sellableOnlineQuantity: 1 }] },
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { shop: { currencyCode: 'CAD' }, products: { nodes: [product(1)], pageInfo: { hasNextPage: true, endCursor: 'next' } } } }))
      .mockResolvedValueOnce(jsonResponse({ data: { shop: { currencyCode: 'CAD' }, products: { nodes: [product(2)], pageInfo: { hasNextPage: false, endCursor: null } } } }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await importShopifyOffers({ shop: 'acme.myshopify.com', accessToken: 't', limit: 2 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).variables.after).toBe('next')
    expect(r.offers.map((offer) => offer.name)).toEqual(['Product 1', 'Product 2'])
    expect(r.catalogComplete).toBe(true)
  })

  it('marks a limit-truncated Shopify catalog as incomplete', async () => {
    const product = {
      id: 'gid://shopify/Product/1',
      title: 'Product 1',
      description: '',
      handle: 'product-1',
      onlineStoreUrl: null,
      variants: { nodes: [{ id: 'gid://shopify/ProductVariant/1', title: 'Default', price: '9.99', availableForSale: true, sellableOnlineQuantity: 1 }] },
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({
      data: { shop: { currencyCode: 'USD' }, products: { nodes: [product], pageInfo: { hasNextPage: true, endCursor: 'next' } } },
    })))

    const r = await importShopifyOffers({ shop: 'acme.myshopify.com', accessToken: 't', limit: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.catalogComplete).toBe(false)
    expect(r.note).toContain('Imported the first 1')
  })

  it('fails closed when Shopify claims another page but omits its cursor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({
      data: {
        shop: { currencyCode: 'USD' },
        products: { nodes: [], pageInfo: { hasNextPage: true, endCursor: null } },
      },
    })))

    const r = await importShopifyOffers({ shop: 'acme.myshopify.com', accessToken: 't' })
    expect(r).toMatchObject({ ok: false, status: 502, error: 'Shopify returned incomplete catalog pagination.' })
  })

  it('an upstream non-2xx is a 502 that never reflects the body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({ secret: 'leak' }, false, 401)))
    const r = await importShopifyOffers({ shop: 'acme.myshopify.com', accessToken: 't' })
    expect(r).toMatchObject({ ok: false, status: 502, upstreamStatus: 401 })
    expect(JSON.stringify(r)).not.toContain('leak')
  })
})

describe('importIntegrationOffers (intake dispatcher - real offers or error, never sample)', () => {
  it('square: a live catalog maps to offers', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => String(input).includes('/v2/catalog/list')
      ? jsonResponse({ objects: [{ id: 'x' }] })
      : jsonResponse({}, false, 403)))
    const r = await importIntegrationOffers({ provider: 'square', accessToken: 't' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.offers[0].name).toBe('Square Item')
  })

  it('square: an unreachable catalog is an error (no sample fallback)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, false, 401)))
    const r = await importIntegrationOffers({ provider: 'square', accessToken: 't' })
    expect(r).toMatchObject({ ok: false, status: 502 })
  })

  it('acuity: a live account maps to offers', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse([{ id: 1 }]))
    vi.stubGlobal('fetch', fetchMock)
    const r = await importIntegrationOffers({ provider: 'acuity', userId: 'u', apiKey: 'k' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.offers[0].name).toBe('Acuity Session')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Basic ${Buffer.from('u:k').toString('base64')}`)
  })

  it('acuity: OAuth uses a bearer token and a failed live request stays an error', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({}, false, 401))
    vi.stubGlobal('fetch', fetchMock)
    const r = await importIntegrationOffers({ provider: 'acuity', accessToken: 'oauth-token' })
    expect(r).toMatchObject({ ok: false, status: 502 })
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer oauth-token')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('acuity: retries one transient read failure before returning live offers', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 503))
      .mockResolvedValueOnce(jsonResponse([{ id: 1 }]))
    vi.stubGlobal('fetch', fetchMock)

    const r = await importIntegrationOffers({ provider: 'acuity', accessToken: 'oauth-token' })

    expect(r.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
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
