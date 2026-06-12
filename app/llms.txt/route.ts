import { AgentPage, PUBLIC_PAGE_SELECT, getCheckoutOffers, getCheckoutPath, getOfferCount, getRequestBaseUrl } from '../../lib/agent-page'
import { getAgentJsonPath } from '../../lib/agent-manifest'
import { supabase } from '../../lib/supabase'

export async function GET(request: Request) {
  const baseUrl = getRequestBaseUrl(request)
  const { data: pages } = await supabase
    .from('pages_public')
    .select(PUBLIC_PAGE_SELECT)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .returns<AgentPage[]>()

  const body = [
    '# Nexez',
    '',
    '> AI-readable product and service pages for businesses that want agent discovery.',
    '',
    `Agent index: ${baseUrl}/agent-pages.json`,
    `Agent search API: ${baseUrl}/api/agent-search?q={query}`,
    `OpenAPI spec: ${baseUrl}/openapi.json`,
    `Capabilities manifest: ${baseUrl}/.well-known/nexez.json`,
    `MCP discovery catalog: ${baseUrl}/.well-known/mcp.json`,
    '',
    '## Published Agent Pages',
    '',
    ...(pages ?? []).map((page) =>
      [
        `- [${page.name}](${baseUrl}/${page.slug})`,
        `  - Agent JSON: ${baseUrl}${getAgentJsonPath(page.slug)}`,
        ...((page as any).mcp_enabled ? [`  - MCP manifest: ${baseUrl}/${page.slug}/mcp.json`] : []),
        `  - Summary: ${page.description || 'No summary provided.'}`,
        `  - Location: ${page.location || 'Not specified'}`,
        `  - Offers: ${getOfferCount(page)}`,
        `  - Primary action: ${page.cta_label || 'Visit website'} -> ${page.cta_url || page.website_url || `${baseUrl}/${page.slug}`}`,
        ...getCheckoutOffers(page).map((offer) =>
          `  - Checkout: ${offer.name} -> ${baseUrl}${getCheckoutPath(page.slug, offer.kind, offer.index)}`,
        ),
      ].join('\n'),
    ),
    '',
    '## Agent Use',
    '',
    'Use these pages to understand each business, compare listed products and services, answer buyer questions, and route purchase or booking intent to the provided URLs.',
    '',
    'For query-based discovery, call the Agent search API with a buyer request such as q=consulting, q=strategy session, or q=book a service.',
    '',
    'For checkout validation, POST to /api/checkout with slug, offer, query, and dryRun=true to verify the handoff without opening Stripe or redirecting.',
  ].join('\n')

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  })
}
