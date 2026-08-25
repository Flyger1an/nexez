import { after } from 'next/server'
import { notFound } from 'next/navigation'
import { ARTIFACT_CORS_HEADERS, artifactPreflight } from '../../../lib/artifact-cors'
import { AgentPage, PUBLIC_PAGE_SELECT, getRequestBaseUrl } from '../../../lib/agent-page'
import { buildAgentPagePayload, buildAgentStorefrontRef } from '../../../lib/agent-manifest'
import { logAgentPageView } from '../../../lib/server/log-agent-page-view'
import { resolveNegotiationAllowed } from '../../../lib/server/negotiation-visibility'
import { loadReviewSummaryForSlug } from '../../../lib/server/reviews'
import { loadStorefrontHandleForSlug } from '../../../lib/server/storefront'
import { supabase } from '../../../lib/supabase'

type RouteProps = {
  params: Promise<{ slug: string }>
}

export async function GET(request: Request, { params }: RouteProps) {
  const { slug } = await params
  const { data: page } = await supabase
    .from('pages_public')
    .select(PUBLIC_PAGE_SELECT)
    .eq('slug', slug)
    .eq('is_published', true)
    .single<AgentPage>()

  if (!page) {
    notFound()
  }

  // Agents commonly fetch this structured endpoint directly (never loading the
  // HTML page). Log the visit non-blocking so it counts toward agent traffic.
  after(() => logAgentPageView({ page, requestHeaders: request.headers, url: request.url }))

  // Compute base preferring the page's verified custom domain when the request
  // is arriving on it (for brand-correct identity in the agent contract), falling
  // back to the hardened canonical base otherwise (prevents arbitrary XFH reflection).
  let baseForPayload = getRequestBaseUrl(request)
  let onCustomHost = false
  if (page.custom_domain && page.custom_domain_verified) {
    const reqHost = (request.headers.get('host') || '').split(':')[0]
    if (reqHost === page.custom_domain || reqHost === `www.${page.custom_domain}`) {
      baseForPayload = `https://${page.custom_domain}${page.domain_path || ''}`.replace(/\/$/, '')
      onCustomHost = true
    }
  }

  const negotiationAllowed = await resolveNegotiationAllowed(page)
  const [storefrontHandle, reviewSummary] = await Promise.all([
    loadStorefrontHandleForSlug(slug),
    loadReviewSummaryForSlug(slug, 3),
  ])
  const payload = buildAgentPagePayload(page, baseForPayload, {
    negotiationAllowed,
    storefront: storefrontHandle ? buildAgentStorefrontRef(storefrontHandle) : null,
    reviewSummary,
    onCustomHost,
  })
  return Response.json(payload, {
    headers: {
      'Cache-Control': 'public, max-age=120, s-maxage=300',
      // The base URL reflects the request host; key the CDN cache on it so a forged
      // x-forwarded-host can't poison the entry served to other hosts.
      Vary: 'x-forwarded-host',
      ...ARTIFACT_CORS_HEADERS,
    },
  })
}

export function OPTIONS() {
  return artifactPreflight()
}
