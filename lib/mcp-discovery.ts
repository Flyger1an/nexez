import { AgentPage, getAgentOfferType, getBaseUrl, getCheckoutOffers, getCheckoutPath, getOfferCount, getPreferredOriginalOfferUrl } from './agent-page'
import { buildAgentDistributionLinks } from './agent-distribution'
import { getAgentJsonPath } from './agent-manifest'

export type McpDiscoveryPage = Pick<
  AgentPage,
  'name' | 'slug' | 'description' | 'location' | 'products' | 'services' | 'created_at' | 'mcp_enabled' | 'prefer_original_site'
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
      kind: getAgentOfferType(offer),
      offer_key: `${offer.kind}-${offer.index}`,
      checkout_url: getPreferredOriginalOfferUrl(page, offer) || `${baseUrl}${getCheckoutPath(page.slug, offer.kind, offer.index)}`,
      mcp_resource_uri: `${baseUrl}/${page.slug}#offer-${offer.index}`,
    })),
    created_at: page.created_at || null,
  }
}

export type McpDiscoveryStorefront = { handle: string; display_name: string | null; listing_count: number }

export function buildMcpDiscoveryCatalog(
  pages: McpDiscoveryPage[] = [],
  baseUrl = getBaseUrl(),
  generatedAt = new Date().toISOString(),
  storefronts: McpDiscoveryStorefront[] = [],
) {
  const mcpEnabledPages = pages.filter((page) => page.mcp_enabled)
  const distribution = buildAgentDistributionLinks(baseUrl)

  return {
    schema_version: 'nexez.mcp-discovery.v1',
    generated_at: generatedAt,
    protocol_note:
      'Discovery catalog for Nexez MCP surfaces. `mcp_endpoint` is the canonical platform JSON-RPC server (search/directory/get_page + dry-run validation); each page + storefront also exposes its own live JSON-RPC `mcp_endpoint`.',
    // The one canonical, discovery-first MCP server for the whole catalog.
    mcp_endpoint: `${baseUrl}/mcp`,
    homepage_url: baseUrl,
    agent_access_url: distribution.docs_url,
    llms_url: `${baseUrl}/llms.txt`,
    capabilities_url: `${baseUrl}/.well-known/nexez.json`,
    agent_index_url: `${baseUrl}/agent-pages.json`,
    openclaw: distribution.openclaw,
    sdks: distribution.sdks,
    examples: distribution.examples,
    page_count: mcpEnabledPages.length,
    pages: mcpEnabledPages.map((page) => buildMcpDiscoveryPage(page, baseUrl)),
    // Per-merchant MCP: one endpoint per storefront that transacts across its
    // whole catalog (always-on for any storefront with published listings).
    storefront_count: storefronts.length,
    storefronts: storefronts.map((s) => ({
      handle: s.handle,
      name: s.display_name || s.handle,
      url: `${baseUrl}/store/${s.handle}`,
      agent_json_url: `${baseUrl}/store/${s.handle}/agent.json`,
      mcp_manifest_url: `${baseUrl}/store/${s.handle}/mcp.json`,
      mcp_endpoint: `${baseUrl}/store/${s.handle}/mcp`,
      listing_count: s.listing_count,
    })),
  }
}
