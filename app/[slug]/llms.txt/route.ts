import { AgentPage, PUBLIC_PAGE_SELECT, getBaseUrl, getCheckoutOffers, getCheckoutPath } from '../../../lib/agent-page'
import { getAgentJsonPath } from '../../../lib/agent-manifest'
import { agentArtifactHref, getEffectiveBaseUrl, isCustomHost, normalizeDomainPath } from '../../../lib/custom-domain'
import { supabase } from '../../../lib/supabase'

/**
 * B5 follow-up: per-page llms.txt scoped to a single page.
 * Served at `/<slug>/llms.txt` and, on a custom domain, mapped to the brand
 * root `/<domain>/llms.txt` by the middleware — so an agent that fetches
 * `acme.com/llms.txt` gets just that brand's page, not the global Nexez index.
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
    return new Response('Not found', { status: 404 })
  }

  // Brand-domain aware identity URLs; transactional URLs stay on the platform.
  const host = request.headers.get('host')
  const platform = getBaseUrl()
  const base = getEffectiveBaseUrl(host, platform, process.env.NEXT_PUBLIC_SITE_URL)
  const onCustomHost = isCustomHost(host, process.env.NEXT_PUBLIC_SITE_URL)
  const domainPath = normalizeDomainPath((page as { domain_path?: string | null }).domain_path)
  const self = onCustomHost ? `${base}${domainPath}` : `${base}/${page.slug}`
  const agentJson = `${base}${onCustomHost ? agentArtifactHref('agent.json', page.slug, true, domainPath) : getAgentJsonPath(page.slug)}`
  const mcpEnabled = Boolean((page as { mcp_enabled?: boolean }).mcp_enabled)
  const offers = getCheckoutOffers(page)

  const body = [
    `# ${page.name}`,
    '',
    `> ${page.description || 'AI-readable agent page on Nexez.'}`,
    '',
    `URL: ${self}`,
    `Agent JSON: ${agentJson}`,
    ...(mcpEnabled
      ? [`MCP manifest: ${base}${agentArtifactHref('mcp.json', page.slug, onCustomHost, domainPath)}`]
      : []),
    `Location: ${page.location || 'Not specified'}`,
    `Best-fit buyer: ${page.audience || 'Not specified'}`,
    `Primary action: ${page.cta_label || 'Visit website'} -> ${page.cta_url || page.website_url || self}`,
    '',
    '## Offers',
    '',
    ...(offers.length
      ? offers.map(
          (o) =>
            `- ${o.name}${o.price ? ` (${o.price})` : ''} -> ${platform}${getCheckoutPath(page.slug, o.kind, o.index)}`,
        )
      : ['- None listed']),
    '',
    '## Agent Use',
    '',
    `This page describes ${page.name}. Use it to understand the offer, compare options, answer buyer questions, and route purchase or booking intent to the URLs above.`,
    `Checkout validation: POST ${platform}/api/checkout with slug="${page.slug}", offer, query, dryRun=true.`,
    `Negotiate: POST ${platform}/api/negotiations with slug="${page.slug}", offer="services-0" or "products-0".`,
  ].join('\n')

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  })
}
