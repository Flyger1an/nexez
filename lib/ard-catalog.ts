import { getBaseUrl } from './agent-page'
import { isInternalMarketplaceFixture, isPlaceholderIdentity } from './marketplace-curation'
import { marketingUrl } from './site'

/**
 * ai-catalog.json builder for Agentic Resource Discovery (ARD).
 *
 * ARD sits BEFORE invocation: it advertises which callable resources exist so a
 * registry can index them, and the agent then connects over the resource's own
 * protocol (MCP here). It does not replace agent.json / ACP / UCP, which
 * describe offers and carry transactions.
 *
 * Conformance notes, taken from the published schema (ai-catalog 1.0):
 *  - The root object is `additionalProperties: false`, so ONLY specVersion,
 *    host, and entries may appear. Resist adding a generated timestamp or
 *    counts here; per-entry `metadata` is the escape hatch.
 *  - Each entry is `oneOf` url / data: exactly one, never both. Every entry we
 *    emit is url-referenced.
 *  - `representativeQueries` is minItems 2 / maxItems 5. Emit 2-5 or omit.
 *  - `metadata` values must be primitives (string | number | boolean | null).
 *  - identifier must match ^urn:ai:<publisher>(:<segment>)+$ where publisher
 *    allows [a-zA-Z0-9.-] and later segments allow [a-zA-Z0-9._-].
 *
 * Deliberately NOT emitted: `trustManifest`. It carries cryptographic identity
 * and compliance attestations (SOC2, HIPAA). We publish none of those today and
 * a fabricated envelope is worse than an absent one.
 */

const AI_CATALOG_SPEC_VERSION = '1.0'
const URN_PUBLISHER = 'nexez.ai'
const MCP_SERVER_CARD = 'application/mcp-server-card+json'
const OPENAPI_JSON = 'application/openapi+json'

/** Keeps the document a sane size for registry crawlers. */
export const ARD_DEFAULT_LIMITS = { storefronts: 60, listings: 200 } as const

export type ArdListing = {
  name: string
  slug: string
  description?: string | null
  location?: string | null
}

export type ArdStorefront = {
  handle: string
  display_name?: string | null
  listing_count?: number | null
}

export type AiCatalogEntry = {
  identifier: string
  displayName: string
  type: string
  url: string
  description?: string
  tags?: string[]
  capabilities?: string[]
  representativeQueries?: string[]
  metadata?: Record<string, string | number | boolean | null>
}

export type AiCatalog = {
  specVersion: string
  host: {
    displayName: string
    identifier?: string
    documentationUrl?: string
    logoUrl?: string
  }
  entries: AiCatalogEntry[]
}

/**
 * An ARD catalog is crawled by third-party registries, which makes it the most
 * externally visible discovery surface we publish. It applies the SAME identity
 * guards as marketplace curation, imported rather than re-declared so the two
 * surfaces cannot drift: QA/gauntlet fixtures and placeholder identities are
 * both excluded.
 *
 * Note that curation scans the description as well as the name and slug, so a
 * listing whose description contains "example" or "sample" is withheld here.
 * That is intentional parity, not an oversight: the same listing is already
 * held back from the marketplace, and one gate deciding differently from the
 * other is the failure mode worth avoiding.
 */
export function isArdPublishable(entity: { name?: string | null; slug?: string | null; description?: string | null }): boolean {
  return !isInternalMarketplaceFixture(entity) && !isPlaceholderIdentity(entity)
}

/** URN segments are restricted; map anything else to a hyphen so a merchant
 *  slug can never produce an identifier that fails schema validation. */
function urnSegment(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/^[-.]+|[-.]+$/g, '')
  return cleaned || 'unknown'
}

/** did:web is anchored to the host serving the catalog (ARD verifies publisher
 *  identity by domain ownership). Port is dropped: did:web encodes ports as
 *  %3A and a dev port in the identifier is noise, not signal. */
function didWebFor(baseUrl: string): string | undefined {
  try {
    const { hostname } = new URL(baseUrl)
    return hostname ? `did:web:${hostname}` : undefined
  } catch {
    return undefined
  }
}

function trimText(value: string | null | undefined, max = 240): string | undefined {
  const text = (value ?? '').trim().replace(/\s+/g, ' ')
  if (!text) return undefined
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}...` : text
}

/** Schema allows 2-5. Callers pass candidates; we drop empties, dedupe, cap at
 *  5, and return undefined below 2 rather than emit an invalid array. */
function representativeQueries(candidates: Array<string | undefined>): string[] | undefined {
  const queries = Array.from(new Set(candidates.filter((q): q is string => Boolean(q && q.trim()))))
  return queries.length >= 2 ? queries.slice(0, 5) : undefined
}

function platformEntries(baseUrl: string, listingCount: number, storefrontCount: number): AiCatalogEntry[] {
  return [
    {
      identifier: `urn:ai:${URN_PUBLISHER}:platform:mcp`,
      displayName: 'Nexez agent commerce MCP server',
      type: MCP_SERVER_CARD,
      url: `${baseUrl}/.well-known/mcp.json`,
      description:
        'Search published business listings by buyer intent, read structured offers, and validate a checkout or booking before committing to it.',
      tags: ['commerce', 'offers', 'booking', 'checkout', 'directory'],
      capabilities: ['search_offers', 'get_listing', 'browse_directory', 'book_offer', 'checkout_dry_run'],
      representativeQueries: [
        'find a business that can do this job and show me the price',
        'compare service providers and their booking options',
        'what does this business charge and can I book it now',
      ],
      metadata: {
        listing_entries: listingCount,
        storefront_entries: storefrontCount,
      },
    },
    {
      identifier: `urn:ai:${URN_PUBLISHER}:platform:agent-search`,
      displayName: 'Nexez agent search API',
      type: OPENAPI_JSON,
      url: `${baseUrl}/openapi.json`,
      description:
        'REST endpoints for buyer-intent search across published listings, plus per-listing offer, availability, and checkout resources.',
      tags: ['search', 'rest', 'commerce'],
      capabilities: ['agent_search', 'listing_lookup', 'offer_feed'],
      representativeQueries: [
        'search local businesses by what they sell',
        'look up structured offers and pricing for a business',
      ],
    },
  ]
}

function storefrontEntry(storefront: ArdStorefront, baseUrl: string): AiCatalogEntry {
  const handle = storefront.handle
  const name = storefront.display_name?.trim() || handle
  const listingCount = typeof storefront.listing_count === 'number' ? storefront.listing_count : null

  return {
    identifier: `urn:ai:${URN_PUBLISHER}:store:${urnSegment(handle)}`,
    displayName: name,
    type: MCP_SERVER_CARD,
    url: `${baseUrl}/store/${handle}/mcp.json`,
    description: `Transact across the full published catalog for ${name}: browse offers, check pricing and availability, and book or check out.`,
    tags: ['storefront', 'commerce', 'catalog'],
    capabilities: ['browse_catalog', 'get_offer', 'book_offer', 'checkout_dry_run'],
    representativeQueries: representativeQueries([
      `buy from ${name}`,
      `${name} pricing and availability`,
    ]),
    metadata: {
      storefront_handle: handle,
      listing_count: listingCount,
      storefront_url: `${baseUrl}/store/${handle}`,
    },
  }
}

function listingEntry(listing: ArdListing, baseUrl: string): AiCatalogEntry {
  const name = listing.name?.trim() || listing.slug
  const location = trimText(listing.location, 80)

  return {
    identifier: `urn:ai:${URN_PUBLISHER}:listing:${urnSegment(listing.slug)}`,
    displayName: name,
    type: MCP_SERVER_CARD,
    url: `${baseUrl}/${listing.slug}/mcp.json`,
    description:
      trimText(listing.description) ||
      `Structured offers, pricing, and booking for ${name}.`,
    tags: location ? ['listing', 'commerce', 'local'] : ['listing', 'commerce'],
    capabilities: ['get_offers', 'book_offer', 'checkout_dry_run'],
    representativeQueries: representativeQueries([
      `book ${name}`,
      `${name} pricing`,
      location ? `${name} in ${location}` : undefined,
    ]),
    metadata: {
      listing_slug: listing.slug,
      location: location ?? null,
      agent_json_url: `${baseUrl}/${listing.slug}/agent.json`,
    },
  }
}

/**
 * Builds the ai-catalog.json document. Pure: the route supplies the rows, so
 * this stays trivially testable and free of Supabase coupling.
 */
export function buildAiCatalog(
  listings: ArdListing[] = [],
  storefronts: ArdStorefront[] = [],
  baseUrl = getBaseUrl(),
  limits: { storefronts: number; listings: number } = ARD_DEFAULT_LIMITS,
): AiCatalog {
  const cappedStorefronts = storefronts
    .filter((storefront) => isArdPublishable({ name: storefront.display_name, slug: storefront.handle }))
    .slice(0, Math.max(0, limits.storefronts))
  const cappedListings = listings
    .filter((listing) => isArdPublishable(listing))
    .slice(0, Math.max(0, limits.listings))
  const identifier = didWebFor(baseUrl)

  return {
    specVersion: AI_CATALOG_SPEC_VERSION,
    host: {
      displayName: 'Nexez',
      ...(identifier ? { identifier } : {}),
      documentationUrl: marketingUrl('/agents'),
      logoUrl: marketingUrl('/icon.png'),
    },
    entries: [
      ...platformEntries(baseUrl, cappedListings.length, cappedStorefronts.length),
      ...cappedStorefronts.map((storefront) => storefrontEntry(storefront, baseUrl)),
      ...cappedListings.map((listing) => listingEntry(listing, baseUrl)),
    ],
  }
}
