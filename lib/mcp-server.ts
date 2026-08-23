// Real MCP (Model Context Protocol) endpoint logic - JSON-RPC 2.0 over HTTP
// (stateless "Streamable HTTP" style). Pure request→response so it's testable;
// the route handles I/O + loading the page. Beyond the static mcp.json, this
// lets MCP-native agents call initialize / tools/list / resources/* directly.
import { AgentPage, getBaseUrl, getCheckoutOffers, getCheckoutOfferKey, getCheckoutPath, getPreferredOriginalOfferUrl } from './agent-page'
import { buildAgentOfferConfiguration } from './agent-offer-configuration'

export const MCP_PROTOCOL_VERSION = '2024-11-05'

type JsonRpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }
type JsonRpcResponse = {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string }
}

function ok(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result }
}
function err(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

function tools(negotiationAllowed: boolean) {
  return [
    {
      name: 'book_offer',
      description: 'Get the booking/checkout target and any merchant-authored buyer configuration requirements for a specific offer (respects per-offer + page original-site preferences and booking constraints).',
      inputSchema: {
        type: 'object',
        properties: { offer: { type: 'string', description: 'Offer key, e.g. services-0 or products-1' } },
        required: ['offer'],
      },
    },
    // negotiate_offer is only advertised when the owner's plan allows negotiation
    // AND the page has a negotiable offer - else calling it would 403.
    ...(negotiationAllowed
      ? [
          {
            name: 'negotiate_offer',
            description: "Submit a proposal (scope, budget, timeline) for seller review before checkout/escrow. Proposals matching the seller's rules may auto-accept; the create response returns a statusUrl to poll for updates.",
            inputSchema: {
              type: 'object',
              properties: {
                offer: { type: 'string', description: 'Offer key, e.g. services-0 or products-1' },
                query: { type: 'string', description: 'Buyer request / context' },
                budget: { type: 'string', description: 'Budget or range' },
                timeline: { type: 'string', description: 'Desired timeline' },
              },
              required: ['offer'],
            },
          },
        ]
      : []),
  ]
}

function resources(page: AgentPage, baseUrl: string) {
  const list = [
    { uri: `${baseUrl}/${page.slug}/agent.json`, name: `${page.name} - Agent manifest`, description: 'Full structured agent-ready data.', mimeType: 'application/json' },
    { uri: `${baseUrl}/${page.slug}/llms.txt`, name: `${page.name} - llms.txt`, description: 'Plain-text agent context.', mimeType: 'text/plain' },
  ]
  for (const offer of getCheckoutOffers(page)) {
    list.push({
      uri: `${baseUrl}/${page.slug}#${getCheckoutOfferKey(offer.kind, offer.index)}`,
      name: offer.name,
      description: offer.description || offer.name,
      mimeType: 'application/json',
    })
  }
  return list
}

function bookOfferContent(offer: ReturnType<typeof getCheckoutOffers>[number], target: string) {
  const configuration = buildAgentOfferConfiguration(offer)
  const stagedPath = configuration?.staged_settlement ? configuration.checkout.path : null
  const stagedTarget = stagedPath
    ? `${new URL(target).origin}${stagedPath}`
    : null
  return [
    {
      type: 'text',
      text: stagedTarget
        ? `Staged booking action for "${offer.name}": POST ${stagedTarget} with dryRun=true before each buyer-approved payment.`
        : `Booking target for "${offer.name}": ${target}`,
    },
    ...(configuration
      ? [{ type: 'text', text: `Offer configuration contract: ${JSON.stringify(configuration)}` }]
      : []),
  ]
}

/** Handle one JSON-RPC MCP request for a page. Pure - the route resolves the
 *  (async) negotiation entitlement and threads it in via opts.negotiationAllowed. */
export function handleMcpRequest(
  page: AgentPage,
  baseUrl: string,
  req: JsonRpcRequest,
  opts: { negotiationAllowed?: boolean } = {},
): JsonRpcResponse {
  const id = req.id ?? null
  const method = req.method || ''
  const negotiationAllowed = opts.negotiationAllowed === true

  switch (method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: `nexez:${page.slug}`, version: '1.0.0' },
      })
    case 'ping':
      return ok(id, {})
    case 'tools/list':
      return ok(id, { tools: tools(negotiationAllowed) })
    case 'resources/list':
      return ok(id, { resources: resources(page, baseUrl) })
    case 'resources/read': {
      const uri = String(req.params?.uri || '')
      const match = resources(page, baseUrl).find((r) => r.uri === uri)
      if (!match) return err(id, -32602, `Unknown resource: ${uri}`)
      return ok(id, { contents: [{ uri, mimeType: match.mimeType, text: `See ${uri}` }] })
    }
    case 'tools/call': {
      const name = String(req.params?.name || '')
      const args = (req.params?.arguments as Record<string, unknown>) || {}
      const offerKey = String(args.offer || '')
      const offer = getCheckoutOffers(page).find((o) => getCheckoutOfferKey(o.kind, o.index) === offerKey)
      if (name === 'book_offer') {
        if (!offer) return err(id, -32602, `Unknown offer: ${offerKey}`)
        const target = getPreferredOriginalOfferUrl(page, offer) || `${getBaseUrl()}${getCheckoutPath(page.slug, offer.kind, offer.index)}`
        return ok(id, { content: bookOfferContent(offer, target) })
      }
      if (name === 'negotiate_offer') {
        // Gate to match the advertised tool list + the gated POST endpoint.
        if (!negotiationAllowed) return err(id, -32601, 'negotiate_offer is not available for this page.')
        return ok(id, {
          content: [{ type: 'text', text: `POST ${getBaseUrl()}/api/negotiations with slug="${page.slug}", offer="${offerKey || 'services-0'}", plus query/budget/timeline.` }],
        })
      }
      return err(id, -32601, `Unknown tool: ${name}`)
    }
    default:
      return err(id, -32601, `Method not found: ${method}`)
  }
}

// --- Storefront (per-merchant) MCP: aggregate ALL of a seller's listings under
// one handle so an agent can transact across the whole catalog. Offer keys
// collide across listings (every listing has services-0), so the merchant-level
// tools take a REQUIRED slug + offer, resolved STRICTLY within the passed
// `listings` (the storefront's own, billing-pause-filtered set) - a slug outside
// that set is rejected (cross-tenant guard). Curated fields only; never raw
// products/services/rules.

function storefrontTools(negotiationAllowed: boolean) {
  const slugProp = { type: 'string', description: 'Listing slug within this storefront (see resources/list).' }
  return [
    {
      name: 'book_offer',
      description: 'Get the booking/checkout target and any merchant-authored buyer configuration requirements for a specific offer in one of this storefront’s listings (respects per-offer + page original-site preferences).',
      inputSchema: {
        type: 'object',
        properties: { slug: slugProp, offer: { type: 'string', description: 'Offer key, e.g. services-0 or products-1' } },
        required: ['slug', 'offer'],
      },
    },
    ...(negotiationAllowed
      ? [
          {
            name: 'negotiate_offer',
            description: "Submit a proposal (scope, budget, timeline) for a listing’s offer for seller review before checkout/escrow.",
            inputSchema: {
              type: 'object',
              properties: {
                slug: slugProp,
                offer: { type: 'string', description: 'Offer key, e.g. services-0 or products-1' },
                query: { type: 'string', description: 'Buyer request / context' },
                budget: { type: 'string', description: 'Budget or range' },
                timeline: { type: 'string', description: 'Desired timeline' },
              },
              required: ['slug', 'offer'],
            },
          },
        ]
      : []),
  ]
}

function storefrontResources(handle: string, listings: AgentPage[], baseUrl: string) {
  const list = [
    {
      uri: `${baseUrl}/store/${handle}/agent.json`,
      name: `Storefront manifest (@${handle})`,
      description: 'Seller-level catalog: brand + links to every published listing.',
      mimeType: 'application/json',
    },
  ]
  for (const page of listings) {
    list.push({
      uri: `${baseUrl}/${page.slug}/agent.json`,
      name: `${page.name} - Agent manifest`,
      description: 'Full structured agent-ready data for this listing.',
      mimeType: 'application/json',
    })
    // Curated offer entries so an agent can derive book_offer args (slug + key).
    for (const offer of getCheckoutOffers(page)) {
      list.push({
        uri: `${baseUrl}/${page.slug}#${getCheckoutOfferKey(offer.kind, offer.index)}`,
        name: `${page.name}: ${offer.name}`,
        description: offer.description || offer.name,
        mimeType: 'application/json',
      })
    }
  }
  return list
}

/** Handle one JSON-RPC MCP request for a whole storefront. Pure - the route loads
 *  the (pause-filtered) listings + resolves the owner-level negotiation entitlement. */
export function handleStorefrontMcpRequest(
  handle: string,
  listings: AgentPage[],
  baseUrl: string,
  req: JsonRpcRequest,
  opts: { negotiationAllowed?: boolean } = {},
): JsonRpcResponse {
  const id = req.id ?? null
  const method = req.method || ''
  const negotiationAllowed = opts.negotiationAllowed === true

  switch (method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: `nexez:store:${handle}`, version: '1.0.0' },
      })
    case 'ping':
      return ok(id, {})
    case 'tools/list':
      return ok(id, { tools: storefrontTools(negotiationAllowed) })
    case 'resources/list':
      return ok(id, { resources: storefrontResources(handle, listings, baseUrl) })
    case 'resources/read': {
      const uri = String(req.params?.uri || '')
      const match = storefrontResources(handle, listings, baseUrl).find((r) => r.uri === uri)
      if (!match) return err(id, -32602, `Unknown resource: ${uri}`)
      return ok(id, { contents: [{ uri, mimeType: match.mimeType, text: `See ${uri}` }] })
    }
    case 'tools/call': {
      const name = String(req.params?.name || '')
      const args = (req.params?.arguments as Record<string, unknown>) || {}
      const slug = String(args.slug || '')
      const offerKey = String(args.offer || '')
      // Cross-tenant guard: the listing MUST belong to this storefront's set.
      const listing = listings.find((p) => p.slug === slug)

      if (name === 'book_offer') {
        if (!listing) return err(id, -32602, `Unknown listing in this storefront: ${slug}`)
        const offer = getCheckoutOffers(listing).find((o) => getCheckoutOfferKey(o.kind, o.index) === offerKey)
        if (!offer) return err(id, -32602, `Unknown offer: ${offerKey}`)
        const target = getPreferredOriginalOfferUrl(listing, offer) || `${getBaseUrl()}${getCheckoutPath(listing.slug, offer.kind, offer.index)}`
        const content = bookOfferContent(offer, target)
        // Keep the existing storefront-specific target text for compatibility.
        content[0] = { type: 'text', text: `Booking target for "${offer.name}" (${listing.name}): ${target}` }
        return ok(id, { content })
      }
      if (name === 'negotiate_offer') {
        if (!negotiationAllowed) return err(id, -32601, 'negotiate_offer is not available for this storefront.')
        if (!listing) return err(id, -32602, `Unknown listing in this storefront: ${slug}`)
        return ok(id, {
          content: [{ type: 'text', text: `POST ${getBaseUrl()}/api/negotiations with slug="${listing.slug}", offer="${offerKey || 'services-0'}", plus query/budget/timeline.` }],
        })
      }
      return err(id, -32601, `Unknown tool: ${name}`)
    }
    default:
      return err(id, -32601, `Method not found: ${method}`)
  }
}
