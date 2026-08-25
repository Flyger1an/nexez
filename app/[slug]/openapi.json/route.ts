import { ARTIFACT_CORS_HEADERS, artifactPreflight } from '../../../lib/artifact-cors'
import { AgentPage, PUBLIC_PAGE_SELECT, getBaseUrl, getCheckoutOffers } from '../../../lib/agent-page'
import { buildPageOpenApiSpec } from '../../../lib/agent-capabilities'
import { withOfferConfigurationOpenApi } from '../../../lib/agent-offer-configuration'
import { getEffectiveBaseUrl, isCustomHost, normalizeDomainPath } from '../../../lib/custom-domain'
import { resolveNegotiationAllowed } from '../../../lib/server/negotiation-visibility'
import { supabase } from '../../../lib/supabase'
import { renamedPageArtifactRedirect } from '../../../lib/server/public-identifier'

/**
 * Per-page OpenAPI spec scoped to a single published page. Served at
 * `/<slug>/openapi.json` and, on a custom domain, at the brand root
 * `/openapi.json` (middleware rewrite) - so an agent that fetches
 * `acme.com/openapi.json` gets acme's checkout surface (slug + real offer keys
 * pinned), not the global Nexez platform spec.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { data: page } = await supabase
    .from('pages_public')
    .select(PUBLIC_PAGE_SELECT)
    .eq('slug', slug)
    .eq('is_published', true)
    .single<AgentPage>()

  if (!page) {
    const redirect = await renamedPageArtifactRedirect(request, slug)
    if (redirect) return redirect
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  // Brand-domain aware identity URLs; transactional server stays the platform.
  const host = request.headers.get('host')
  const platform = getBaseUrl()
  const base = getEffectiveBaseUrl(host, platform, process.env.NEXT_PUBLIC_SITE_URL)
  const onCustomHost = isCustomHost(host, process.env.NEXT_PUBLIC_SITE_URL)
  const domainPath = normalizeDomainPath((page as { domain_path?: string | null }).domain_path)
  const negotiationAllowed = await resolveNegotiationAllowed(page)

  const spec = buildPageOpenApiSpec(page, {
    platformBase: platform,
    identityBase: base,
    onCustomHost,
    domainPath,
    negotiationAllowed,
  })

  return Response.json(
    withOfferConfigurationOpenApi(spec, getCheckoutOffers(page)),
    {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300',
        Vary: 'x-forwarded-host',
        ...ARTIFACT_CORS_HEADERS,
      },
    },
  )
}

export function OPTIONS() {
  return artifactPreflight()
}
