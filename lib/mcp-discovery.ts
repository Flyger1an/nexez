import { AgentPage, getBaseUrl, getCheckoutOffers, getCheckoutPath, getOfferCount } from './agent-page'
import { buildAgentDistributionLinks } from './agent-distribution'
import { getAgentJsonPath } from './agent-manifest'

export type McpDiscoveryPage = Pick<
  AgentPage,
  'name' | 'slug' | 'description' | 'location' | 'products' | 'services' | 'created_at' | 'mcp_enabled'
>

export function buildMcpDiscoveryPage(page: McpDiscoveryPage, baseUrl = getBaseUrl()) {
  const offers = getCheckoutOffers(page as AgentPage)

  return {
    name: page.name,
    slug: page.slug,
    url: `${baseUrl}/${page.slug}`,
    description: page.description || '',
    location: page.location || '',
    mcp_manifest_url: `${baseUrl}/${page.slug}/mcp.json`,
    agent_json_url: `${baseUrl}${getAgentJsonPath(page.slug)}`,
    offer_count: getOfferCount(page as AgentPage),
    capabilities: {
      resources: ['seller_profile', 'offers', 'faqs', 'agent_memory'],
      tools: ['book_offer'],
      checkout_dry_run: true,
    },
    offers: offers.map((offer) => ({
      name: offer.name,
      kind: offer.kind === 'services' ? 'service' : 'product',
      offer_key: `${offer.kind}-${offer.index}`,
      checkout_url: `${baseUrl}${getCheckoutPath(page.slug, offer.kind, offer.index)}`,
      mcp_resource_uri: `${baseUrl}/${page.slug}#offer-${offer.index}`,
    })),
    created_at: page.created_at || null,
  }
}

export function buildMcpDiscoveryCatalog(
  pages: McpDiscoveryPage[] = [],
  baseUrl = getBaseUrl(),
  generatedAt = new Date().toISOString(),
) {
  const mcpEnabledPages = pages.filter((page) => page.mcp_enabled)
  const distribution = buildAgentDistributionLinks(baseUrl)

  return {
    schema_version: 'nexez.mcp-discovery.v1',
    generated_at: generatedAt,
    protocol_note:
      'Discovery catalog for Nexez pages that expose MCP-compatible JSON resources. Per-page manifests are data-only resources, not a streaming MCP transport.',
    homepage_url: baseUrl,
    agent_access_url: distribution.docs_url,
    llms_url: `${baseUrl}/llms.txt`,
    capabilities_url: `${baseUrl}/.well-known/nexez.json`,
    agent_index_url: `${baseUrl}/agent-pages.json`,
    openclaw: distribution.openclaw,
    sdks: distribution.sdks,
    page_count: mcpEnabledPages.length,
    pages: mcpEnabledPages.map((page) => buildMcpDiscoveryPage(page, baseUrl)),
  }
}
