import { describe, expect, it } from 'vitest'
import {
  ARD_DEFAULT_LIMITS,
  ArdDomainListing,
  ArdListing,
  ArdStorefront,
  buildAiCatalog,
  buildListingAiCatalog,
  isArdPublishable,
  listingUrn,
} from '../ard-catalog'
import { isInternalMarketplaceFixture, isPlaceholderIdentity } from '../marketplace-curation'

// Mirrors the published ai-catalog 1.0 schema constraints. These are the rules a
// registry will validate against, so they are asserted directly rather than
// assumed.
const URN_PATTERN = /^urn:ai:[a-zA-Z0-9.-]+(:[a-zA-Z0-9._-]+)+$/
const ROOT_KEYS = ['specVersion', 'host', 'entries']
const HOST_KEYS = ['displayName', 'identifier', 'documentationUrl', 'logoUrl', 'trustManifest']

/** Every catalog we emit, from either builder, must satisfy these. */
function expectSchemaConformance(catalog: { specVersion: string; host: Record<string, unknown>; entries: unknown[] }) {
  expect(Object.keys(catalog).sort()).toEqual([...ROOT_KEYS].sort())
  expect(catalog.specVersion).toBe('1.0')
  expect(Object.keys(catalog.host).every((key) => HOST_KEYS.includes(key))).toBe(true)

  for (const entry of catalog.entries as Array<Record<string, unknown>>) {
    expect(entry.identifier as string).toMatch(URN_PATTERN)
    expect((entry.displayName as string).length).toBeGreaterThan(0)
    expect((entry.type as string).length).toBeGreaterThan(0)
    expect(entry.url as string).toMatch(/^https?:\/\//)
    // oneOf url/data: carrying both fails validation.
    expect(entry).not.toHaveProperty('data')
    const queries = entry.representativeQueries as string[] | undefined
    if (queries !== undefined) {
      expect(queries.length).toBeGreaterThanOrEqual(2)
      expect(queries.length).toBeLessThanOrEqual(5)
    }
    for (const value of Object.values((entry.metadata as Record<string, unknown>) ?? {})) {
      const isPrimitive = value === null || ['string', 'number', 'boolean'].includes(typeof value)
      expect(isPrimitive).toBe(true)
    }
  }
}

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

describe('ARD platform catalog', () => {
  it('conforms to the ai-catalog 1.0 schema', () => {
    expectSchemaConformance(buildAiCatalog([listing], [storefront], 'https://nexez.test'))
  })

  it('emits only the root keys the schema allows', () => {
    const catalog = buildAiCatalog([listing], [storefront], 'https://nexez.test')
    expect(catalog.host.displayName).toBe('Nexez')
    expect(catalog.host.identifier).toBe('did:web:nexez.test')
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

    expect(catalog.entries.filter((e) => e.identifier.includes(':listing:'))).toHaveLength(ARD_DEFAULT_LIMITS.listings)
    expect(catalog.entries.filter((e) => e.identifier.includes(':store:'))).toHaveLength(ARD_DEFAULT_LIMITS.storefronts)
  })

  it('sanitizes slugs that would otherwise break the URN pattern', () => {
    const catalog = buildAiCatalog([{ ...listing, slug: 'caf\u00e9-co-spa' }], [], 'https://nexez.test')
    const page = catalog.entries.find((e) => e.identifier.includes(':listing:'))
    expect(page?.identifier).toMatch(URN_PATTERN)
  })
})

describe('ARD publishability gate (platform catalog only)', () => {
  // These are the exact fixtures that leaked into the first live response.
  it.each([
    ['nexez-agent-negotiation-lab', 'Nexez Agent Negotiation Lab'],
    ['shopify-review-catalog', 'Shopify Review Catalog'],
    ['gauntlet-negotiation-lab', 'Nexez Negotiation Gauntlet Lab'],
    ['qa33-23', 'Bare Draft 23'],
    ['abc-consulting-copy', 'abc consulting (Copy)'],
    ['a', 'abc consulting'],
  ])('excludes the QA fixture or scratch listing %s', (slug, name) => {
    expect(isArdPublishable({ slug, name })).toBe(false)
  })

  it.each([
    ['kismetpros', 'Kismet Pros'],
    ['pawra-pet-cares', 'PAWRA PET CARES'],
    ['kismet', 'Kismet'],
  ])('keeps the real merchant listing %s', (slug, name) => {
    expect(isArdPublishable({ slug, name })).toBe(true)
  })

  // Parity is the point: one gate must never admit what the other withholds.
  it('agrees with marketplace curation on every identity decision', () => {
    const cases = [
      { slug: 'kismetpros', name: 'Kismet Pros', description: 'Housekeeping in DFW.' },
      { slug: 'gauntlet-negotiation-lab', name: 'Gauntlet', description: 'Load testing.' },
      { slug: 'abc-consulting-copy', name: 'abc consulting (Copy)', description: '' },
      { slug: 'demo-bakery', name: 'Bakery', description: 'A demo listing.' },
      { slug: 'real-bakery', name: 'Real Bakery', description: 'Wedding cakes for Austin.' },
    ]

    for (const probe of cases) {
      const curationWouldHold = isInternalMarketplaceFixture(probe) || isPlaceholderIdentity(probe)
      expect(isArdPublishable(probe)).toBe(!curationWouldHold)
    }
  })

  it('now honors description signals, matching curation', () => {
    expect(isArdPublishable({ slug: 'sunrise-cafe', name: 'Sunrise Cafe', description: 'A sample listing.' })).toBe(false)
  })

  it('filters fixtures out of the built catalog entirely', () => {
    const catalog = buildAiCatalog(
      [listing, { name: 'Gauntlet', slug: 'gauntlet-negotiation-lab' }],
      [storefront, { handle: 'qa33-23', display_name: 'Bare Draft 23' }],
      'https://nexez.test',
    )

    const identifiers = catalog.entries.map((e) => e.identifier).join(' ')
    expect(identifiers).not.toContain('gauntlet')
    expect(identifiers).not.toContain('qa33')

    const platform = catalog.entries.find((e) => e.identifier.endsWith(':platform:mcp'))
    expect(platform?.metadata?.listing_entries).toBe(1)
    expect(platform?.metadata?.storefront_entries).toBe(1)
  })
})

describe('ARD merchant catalog (own verified domain)', () => {
  const brand: ArdDomainListing = {
    name: 'Kismet',
    slug: 'kismet',
    description: 'Culinary experiences for groups visiting Austin',
    location: 'Austin, TX',
    domain_path: '/',
  }

  it('conforms to the ai-catalog 1.0 schema', () => {
    expectSchemaConformance(
      buildListingAiCatalog([brand], { baseUrl: 'https://agents.kismetpros.com', onBrandDomain: true }),
    )
  })

  it('advertises artifacts at the brand domain root, not under the slug', () => {
    const catalog = buildListingAiCatalog([brand], {
      baseUrl: 'https://agents.kismetpros.com',
      onBrandDomain: true,
    })
    const entry = catalog.entries[0]!

    expect(entry.url).toBe('https://agents.kismetpros.com/mcp.json')
    expect(entry.metadata?.agent_json_url).toBe('https://agents.kismetpros.com/agent.json')
    // The slug must NOT leak into the brand-domain URLs.
    expect(entry.url).not.toContain('/kismet/')
  })

  it('claims did:web for the brand host and names the merchant', () => {
    const catalog = buildListingAiCatalog([brand], {
      baseUrl: 'https://agents.kismetpros.com',
      onBrandDomain: true,
      hostDisplayName: 'Kismet',
    })

    expect(catalog.host.identifier).toBe('did:web:agents.kismetpros.com')
    expect(catalog.host.displayName).toBe('Kismet')
    // We do not guess at a merchant logo asset.
    expect(catalog.host.logoUrl).toBeUndefined()
  })

  it('honors domain_path for a listing hosted on a sub-page', () => {
    const sub: ArdDomainListing = { ...brand, slug: 'kismet-pricing', domain_path: '/pricing' }
    const catalog = buildListingAiCatalog([sub], {
      baseUrl: 'https://agents.kismetpros.com',
      onBrandDomain: true,
    })

    expect(catalog.entries[0]!.url).toBe('https://agents.kismetpros.com/pricing/mcp.json')
    expect(catalog.entries[0]!.metadata?.agent_json_url).toBe('https://agents.kismetpros.com/pricing/agent.json')
  })

  it('lists every listing hosted on the domain', () => {
    const catalog = buildListingAiCatalog(
      [brand, { ...brand, slug: 'kismet-pricing', domain_path: '/pricing' }],
      { baseUrl: 'https://agents.kismetpros.com', onBrandDomain: true },
    )

    expect(catalog.entries).toHaveLength(2)
    expect(catalog.entries.map((e) => e.url)).toEqual([
      'https://agents.kismetpros.com/mcp.json',
      'https://agents.kismetpros.com/pricing/mcp.json',
    ])
  })

  it('falls back to per-slug paths when NOT on the brand domain', () => {
    const catalog = buildListingAiCatalog([brand], {
      baseUrl: 'https://nexez.app',
      onBrandDomain: false,
    })

    expect(catalog.entries[0]!.url).toBe('https://nexez.app/kismet/mcp.json')
    expect(catalog.host.identifier).toBe('did:web:nexez.app')
  })

  it('treats a missing domain_path as the domain root', () => {
    const catalog = buildListingAiCatalog([{ ...brand, domain_path: null }], {
      baseUrl: 'https://agents.kismetpros.com',
      onBrandDomain: true,
    })
    expect(catalog.entries[0]!.url).toBe('https://agents.kismetpros.com/mcp.json')
  })

  it('uses the SAME URN as the platform catalog so registries dedupe', () => {
    // ARD registries deduplicate by identifier. A listing discovered both via the
    // platform catalog and via its own domain must collapse to one result.
    const platform = buildAiCatalog([brand], [], 'https://nexez.app')
    const merchant = buildListingAiCatalog([brand], {
      baseUrl: 'https://agents.kismetpros.com',
      onBrandDomain: true,
    })

    const platformEntry = platform.entries.find((e) => e.identifier.includes(':listing:'))
    expect(merchant.entries[0]!.identifier).toBe(platformEntry?.identifier)
    expect(merchant.entries[0]!.identifier).toBe(listingUrn('kismet'))
  })

  it('falls back to the listing name, then the slug, for the host display name', () => {
    expect(
      buildListingAiCatalog([brand], { baseUrl: 'https://agents.kismetpros.com', onBrandDomain: true })
        .host.displayName,
    ).toBe('Kismet')
    expect(
      buildListingAiCatalog([{ ...brand, name: '' }], {
        baseUrl: 'https://agents.kismetpros.com',
        onBrandDomain: true,
      }).host.displayName,
    ).toBe('kismet')
  })
})
