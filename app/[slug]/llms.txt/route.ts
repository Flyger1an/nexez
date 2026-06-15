import { AgentPage, PUBLIC_PAGE_SELECT, getBaseUrl, getCheckoutOffers, getCheckoutPath, sanitizePublicUrl } from '../../../lib/agent-page'
import { getAgentJsonPath } from '../../../lib/agent-manifest'
import { markdownText } from '../../../lib/agent-text'
import { agentArtifactHref, getEffectiveBaseUrl, isCustomHost, normalizeDomainPath } from '../../../lib/custom-domain'
import { resolveNegotiationAllowed } from '../../../lib/server/negotiation-visibility'
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
  const negotiationAllowed = await resolveNegotiationAllowed(page)
  const primaryActionUrl = sanitizePublicUrl(page.cta_url) || sanitizePublicUrl(page.website_url) || self

  const body = [
    `# ${markdownText(page.name, 'Agent page', 120)}`,
    '',
    `> ${markdownText(page.description, 'AI-readable agent page on Nexez.', 360)}`,
    '',
    `URL: ${self}`,
    `Agent JSON: ${agentJson}`,
    ...(mcpEnabled
      ? [`MCP manifest: ${base}${agentArtifactHref('mcp.json', page.slug, onCustomHost, domainPath)}`]
      : []),
    `Location: ${markdownText(page.location, 'Not specified', 160)}`,
    `Best-fit buyer: ${markdownText(page.audience, 'Not specified', 180)}`,
    `Primary action: ${markdownText(page.cta_label, 'Visit website', 80)} -> ${primaryActionUrl}`,
    '',
    '## Offers',
    '',
    ...(offers.length
      ? offers.map(
          (o) =>
            `- ${markdownText(o.name, 'Offer', 120)}${o.price ? ` (${markdownText(o.price, '', 60)})` : ''} -> ${platform}${getCheckoutPath(page.slug, o.kind, o.index)}`,
        )
      : ['- None listed']),
    '',
    '## Agent Use',
    '',
    `This page describes ${markdownText(page.name, 'this business', 120)}. Use it to understand the offer, compare options, answer buyer questions, and route purchase or booking intent to the URLs above.`,
    `Checkout validation: POST ${platform}/api/checkout with slug="${page.slug}", offer, query, dryRun=true.`,
    // Only advertise negotiation when the plan allows it AND a negotiable offer
    // exists — otherwise the endpoint 403s (matches the HTML render + agent.json).
    ...(negotiationAllowed
      ? [`Negotiate: POST ${platform}/api/negotiations with slug="${page.slug}", offer="services-0" or "products-0".`]
      : []),
  ].join('\n')

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  })
}
