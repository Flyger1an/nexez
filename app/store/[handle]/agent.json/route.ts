import { getBaseUrl, getOfferCount, getReadinessScore, getCertification } from '../../../../lib/agent-page'
import { getAgentJsonPath } from '../../../../lib/agent-manifest'
import { loadStorefrontByHandle } from '../../../../lib/server/storefront'

type RouteProps = { params: Promise<{ handle: string }> }

/**
 * Storefront manifest: a per-seller catalog so an agent can discover a whole
 * storefront (brand + all its listings' agent.json URLs) in one fetch. Additive to the
 * agent contract — the per-listing /[slug]/agent.json is unchanged.
 */
export async function GET(_request: Request, { params }: RouteProps) {
  const { handle } = await params
  const resolved = await loadStorefrontByHandle(handle)
  if (!resolved) return new Response('Not found', { status: 404 })

  const { storefront, listings } = resolved
  const base = getBaseUrl()
  const storefrontUrl = `${base}/store/${storefront.handle}`

  // Storefront-level aggregate signals across the seller's listings.
  const totalOffers = listings.reduce((sum, p) => sum + getOfferCount(p), 0)
  const avgReadiness = listings.length
    ? Math.round(listings.reduce((sum, p) => sum + getReadinessScore(p), 0) / listings.length)
    : 0
  const certifiedListings = listings.filter((p) => getCertification(p).certified).length

  const payload = {
    schema_version: 'nexez.storefront.v1',
    generated_at: new Date().toISOString(),
    storefront: {
      handle: storefront.handle,
      name: storefront.display_name || storefront.handle,
      description: storefront.description || null,
      url: storefrontUrl,
      logo_url: storefront.logo_url || null,
      listings_count: listings.length,
      total_offers: totalOffers,
      avg_readiness: avgReadiness,
      certified_listings: certifiedListings,
    },
    listings: listings.map((page) => ({
      name: page.name,
      slug: page.slug,
      url: `${base}/${page.slug}`,
      agent_json_url: `${base}${getAgentJsonPath(page.slug)}`,
      description: page.description || null,
      offer_count: getOfferCount(page),
      readiness: getReadinessScore(page),
      certified: getCertification(page).certified,
    })),
  }

  return Response.json(payload, {
    headers: {
      'Cache-Control': 'public, max-age=120, s-maxage=300',
      Vary: 'x-forwarded-host',
    },
  })
}
