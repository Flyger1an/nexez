import { AgentPage, getRequestBaseUrl } from '../../../lib/agent-page'
import { publicLaunchVisiblePages } from '../../../lib/public-page-visibility'
import { buildAcpFeedItems } from '../../../lib/acp/feed'
import { ACP_API_VERSION, ACP_FEED_SCHEMA_VERSION, acpCheckoutEnabled } from '../../../lib/acp/constants'
import { acpCheckoutEligibleSlugs } from '../../../lib/server/agentic-commerce-eligibility'
import { ARTIFACT_CORS_HEADERS, artifactPreflight } from '../../../lib/artifact-cors'
import { supabase } from '../../../lib/supabase'

/**
 * ACP product feed (OpenAI Agentic Commerce Protocol). A flat file OpenAI ingests to
 * index Nexez offers for Instant Checkout discovery - a second projection of the same
 * public offer catalog the agent index (/agent-pages.json) exposes, re-labelled into
 * ACP field names via lib/acp/feed. Canonical on the agent runtime (nexez.app).
 *
 * Route: GET /acp/feed.json (public, published+visible pages only, cached).
 */
export async function GET(request: Request) {
  const baseUrl = getRequestBaseUrl(request)

  const { data: pages } = await supabase
    .from('pages_public')
    .select('name, slug, description, products, services, currency, website_url, is_published')
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .returns<AgentPage[]>()

  const visible = publicLaunchVisiblePages(pages)
  // Per-seller checkout gate: only Pro+ sellers with a charge-ready Stripe Connect account
  // may transact. `null` when the ACP program itself is off (then nothing is checkout-eligible).
  const eligibleSlugs = await acpCheckoutEligibleSlugs(visible.map((p) => p.slug))
  const products = buildAcpFeedItems(visible, baseUrl, {
    checkoutEnabled: acpCheckoutEnabled(),
    checkoutEligibleSlugs: eligibleSlugs ?? undefined,
  })

  return Response.json(
    {
      schema_version: ACP_FEED_SCHEMA_VERSION,
      api_version: ACP_API_VERSION,
      generated_at: new Date().toISOString(),
      products,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=900',
        'API-Version': ACP_API_VERSION,
        // Base URL reflects the request host - vary the CDN cache key on it.
        Vary: 'x-forwarded-host',
        ...ARTIFACT_CORS_HEADERS,
      },
    },
  )
}

export function OPTIONS() {
  return artifactPreflight()
}
