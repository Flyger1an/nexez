import { AgentPage, getRequestBaseUrl } from '../../../lib/agent-page'
import { publicLaunchVisiblePages } from '../../../lib/public-page-visibility'
import { buildUcpFeedItems } from '../../../lib/ucp/feed'
import { UCP_FEED_SCHEMA_VERSION, ucpCheckoutEnabled } from '../../../lib/ucp/constants'
import { ARTIFACT_CORS_HEADERS, artifactPreflight } from '../../../lib/artifact-cors'
import { supabase } from '../../../lib/supabase'

/**
 * UCP / Google Merchant Center product feed. A second projection of the same public
 * offer catalog the ACP feed + agent index expose, re-labelled into Merchant-Center
 * field names via lib/ucp/feed. Canonical on the agent runtime (nexez.app).
 *
 * Route: GET /ucp/feed.json (public, published+visible pages only, cached).
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
  const products = buildUcpFeedItems(visible, baseUrl, { checkoutEnabled: ucpCheckoutEnabled() })

  return Response.json(
    {
      schema_version: UCP_FEED_SCHEMA_VERSION,
      generated_at: new Date().toISOString(),
      products,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=900',
        Vary: 'x-forwarded-host',
        ...ARTIFACT_CORS_HEADERS,
      },
    },
  )
}

export function OPTIONS() {
  return artifactPreflight()
}
