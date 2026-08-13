import { describe, expect, it } from 'vitest'
import { ARD_DEFAULT_LIMITS, ArdListing, ArdStorefront, buildAiCatalog } from '../ard-catalog'

// Mirrors the published ai-catalog 1.0 schema constraints. These are the rules a
// registry will validate against, so they are asserted directly rather than
// assumed.
const URN_PATTERN = /^urn:ai:[a-zA-Z0-9.-]+(:[a-zA-Z0-9._-]+)+$/
const ROOT_KEYS = ['specVersion', 'host', 'entries']
const HOST_KEYS = ['displayName', 'identifier', 'documentationUrl', 'logoUrl', 'trustManifest']

const listing: ArdListing = {
  name: 'Acme Consulting',
  slug: 'acme',
  description: 'Strategy services for operators',
  location: 'Remote',
}

const storefront: ArdStorefront = {
  handle: 'acme-co',
  display_name: 'Acme Co',
  listing_count: 3,
}

describe('ARD ai-catalog builder', () => {
  it('emits only the root keys the schema allows', () => {
    const catalog = buildAiCatalog([listing], [storefront], 'https://nexez.test')

    expect(Object.keys(catalog).sort()).toEqual([...ROOT_KEYS].sort())
    expect(catalog.specVersion).toBe('1.0')
    expect(Object.keys(catalog.host).every((key) => HOST_KEYS.includes(key))).toBe(true)
    expect(catalog.host.displayName).toBe('Nexez')
    expect(catalog.host.identifier).toBe('did:web:nexez.test')
  })

  it('gives every entry a schema-valid URN, a url, and never an inline data block', () => {
    const catalog = buildAiCatalog([listing], [storefront], 'https://nexez.test')

    expect(catalog.entries.length).toBeGreaterThan(0)
    for (const entry of catalog.entries) {
      expect(entry.identifier).toMatch(URN_PATTERN)
      expect(entry.displayName.length).toBeGreaterThan(0)
      expect(entry.type.length).toBeGreaterThan(0)
      expect(entry.url).toMatch(/^https?:\/\//)
      // oneOf url/data: carrying both fails validation.
      expect(entry).not.toHaveProperty('data')
    }
  })

  it('keeps representativeQueries inside the 2..5 bound or omits them', () => {
    const catalog = buildAiCatalog([listing], [storefront], 'https://nexez.test')

    for (const entry of catalog.entries) {
      if (entry.representativeQueries === undefined) continue
      expect(entry.representativeQueries.length).toBeGreaterThanOrEqual(2)
      expect(entry.representativeQueries.length).toBeLessThanOrEqual(5)
    }
  })

  it('restricts metadata values to primitives', () => {
    const catalog = buildAiCatalog([listing], [storefront], 'https://nexez.test')

    for (const entry of catalog.entries) {
      for (const value of Object.values(entry.metadata ?? {})) {
        const isPrimitive = value === null || ['string', 'number', 'boolean'].includes(typeof value)
        expect(isPrimitive).toBe(true)
      }
    }
  })

  it('points storefront and listing entries at their own MCP manifests', () => {
    const catalog = buildAiCatalog([listing], [storefront], 'https://nexez.test')
    const store = catalog.entries.find((e) => e.identifier.includes(':store:'))
    const page = catalog.entries.find((e) => e.identifier.includes(':listing:'))

    expect(store?.url).toBe('https://nexez.test/store/acme-co/mcp.json')
    expect(store?.displayName).toBe('Acme Co')
    expect(page?.url).toBe('https://nexez.test/acme/mcp.json')
    expect(page?.metadata?.agent_json_url).toBe('https://nexez.test/acme/agent.json')
  })

  it('always advertises the platform MCP server, even with an empty catalog', () => {
    const catalog = buildAiCatalog([], [], 'https://nexez.test')
    const platform = catalog.entries.find((e) => e.identifier.endsWith(':platform:mcp'))

    expect(platform?.url).toBe('https://nexez.test/.well-known/mcp.json')
    expect(platform?.metadata?.listing_entries).toBe(0)
    expect(platform?.metadata?.storefront_entries).toBe(0)
  })

  it('caps entries so the document stays crawlable', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ ...listing, slug: `acme-${i}` }))
    const manyStores = Array.from({ length: 200 }, (_, i) => ({ ...storefront, handle: `store-${i}` }))
    const catalog = buildAiCatalog(many, manyStores, 'https://nexez.test')

    const listingEntries = catalog.entries.filter((e) => e.identifier.includes(':listing:'))
    const storeEntries = catalog.entries.filter((e) => e.identifier.includes(':store:'))
    expect(listingEntries).toHaveLength(ARD_DEFAULT_LIMITS.listings)
    expect(storeEntries).toHaveLength(ARD_DEFAULT_LIMITS.storefronts)
  })

  it('sanitizes slugs that would otherwise break the URN pattern', () => {
    const catalog = buildAiCatalog(
      [{ ...listing, slug: 'caf\u00e9 & co/spa' }],
      [],
      'https://nexez.test',
    )
    const page = catalog.entries.find((e) => e.identifier.includes(':listing:'))

    expect(page?.identifier).toMatch(URN_PATTERN)
  })

  it('falls back to the slug when a listing has no name and omits an empty description', () => {
    const catalog = buildAiCatalog(
      [{ name: '', slug: 'no-name', description: '   ', location: null }],
      [],
      'https://nexez.test',
    )
    const page = catalog.entries.find((e) => e.identifier.includes(':listing:'))

    expect(page?.displayName).toBe('no-name')
    expect(page?.description).toContain('no-name')
  })
})
