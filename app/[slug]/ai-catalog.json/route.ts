import { NextResponse } from 'next/server'
import { ARTIFACT_CORS_HEADERS, artifactPreflight } from '../../../lib/artifact-cors'
import { getRequestBaseUrl } from '../../../lib/agent-page'
import { buildListingAiCatalog, type ArdDomainListing } from '../../../lib/ard-catalog'
import { hostLookupCandidates, normalizeHost } from '../../../lib/custom-domain'
import { supabase } from '../../../lib/supabase'

/**
 * Per-listing ARD catalog: GET /<slug>/ai-catalog.json
 *
 * Reached two ways:
 *  1. Directly on the platform runtime (nexez.app/<slug>/ai-catalog.json).
 *  2. Rewritten by proxy.ts from `<brand-domain>/.well-known/ai-catalog.json`,
 *     which is the spec-mandated location and the reason this exists: it makes
 *     every merchant an ARD publisher under their OWN verified domain, so a
 *     registry doing a direct catalog fetch finds them without Nexez in the
 *     middle.
 *
 * Gating is publication + MCP, matching the sibling agent.json and mcp.json
 * routes. Marketplace curation deliberately does NOT apply: this is the
 * merchant describing themselves on their own domain, not Nexez vouching for
 * them inside a shared index (that is the platform catalog's job).
 *
 * The response depends on the Host header, so it MUST carry Vary.
 * X-Robots-Tag is NOT set here: ARTIFACT_CORS_HEADERS already carries
 * `noindex`, and setting it twice is a type error (the later spread wins).
 */

type CatalogRow = ArdDomainListing & {
  custom_domain: string | null
  custom_domain_verified: string | null
  mcp_enabled: boolean | null
}

const CATALOG_SELECT =
  'name, slug, description, location, domain_path, custom_domain, custom_domain_verified, mcp_enabled'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const host = normalizeHost(request.headers.get('host'))

  const { data: anchor } = await supabase
    .from('pages_public')
    .select(CATALOG_SELECT)
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle<CatalogRow>()

  if (!anchor || !anchor.mcp_enabled) {
    return NextResponse.json(
      { error: 'No ARD catalog for this listing (not found, unpublished, or MCP disabled)' },
      { status: 404, headers: { ...ARTIFACT_CORS_HEADERS } },
    )
  }

  // Serving on the listing's OWN verified domain? Only then do we advertise
  // root-relative artifact paths and claim did:web for the brand host. Comparing
  // against the stored custom_domain (not merely "is this a custom host")
  // prevents an arbitrary Host header from minting a brand identity.
  const onBrandDomain = Boolean(
    anchor.custom_domain &&
      anchor.custom_domain_verified &&
      hostLookupCandidates(host).includes(anchor.custom_domain),
  )

  // A domain can host several listings via domain_path, and ARD catalogs are
  // host-scoped, so the brand catalog lists every published listing on it.
  let listings: ArdDomainListing[] = [anchor]
  if (onBrandDomain) {
    const { data: siblings } = await supabase
      .from('pages_public')
      .select(CATALOG_SELECT)
      .in('custom_domain', hostLookupCandidates(host))
      .eq('is_published', true)
      .eq('mcp_enabled', true)
      .not('custom_domain_verified', 'is', null)
      .returns<CatalogRow[]>()

    if (siblings?.length) {
      listings = [...siblings].sort((a, b) => a.slug.localeCompare(b.slug))
    }
  }

  const catalog = buildListingAiCatalog(listings, {
    baseUrl: onBrandDomain ? `https://${host}` : getRequestBaseUrl(request),
    onBrandDomain,
    hostDisplayName: onBrandDomain ? anchor.name : undefined,
  })

  return NextResponse.json(catalog, {
    headers: {
      'Cache-Control': 'public, max-age=120, s-maxage=600',
      // Output is host-dependent (brand domain vs platform) - never let the CDN
      // serve one host's catalog to another.
      Vary: 'x-forwarded-host',
      ...ARTIFACT_CORS_HEADERS,
    },
  })
}

export function OPTIONS() {
  return artifactPreflight()
}
