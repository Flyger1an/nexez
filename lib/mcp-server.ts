// Real MCP (Model Context Protocol) endpoint logic — JSON-RPC 2.0 over HTTP
// (stateless "Streamable HTTP" style). Pure request→response so it's testable;
// the route handles I/O + loading the page. Beyond the static mcp.json, this
// lets MCP-native agents call initialize / tools/list / resources/* directly.
import { AgentPage, getCheckoutOffers, getCheckoutOfferKey, getCheckoutPath } from './agent-page'

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

function tools() {
  return [
    {
      name: 'book_offer',
      description: 'Get the booking/checkout target for a specific offer (respects per-offer + page original-site preferences).',
      inputSchema: {
        type: 'object',
        properties: { offer: { type: 'string', description: 'Offer key, e.g. services-0 or products-1' } },
        required: ['offer'],
      },
    },
    {
      name: 'negotiate_offer',
      description: 'Submit a proposal (scope, budget, timeline) for seller review before checkout/escrow.',
      inputSchema: {
        type: 'object',
        properties: {
          offer: { type: 'string' },
          query: { type: 'string' },
          budget: { type: 'string' },
          timeline: { type: 'string' },
        },
        required: ['offer'],
      },
    },
  ]
}

function resources(page: AgentPage, baseUrl: string) {
  const list = [
    { uri: `${baseUrl}/${page.slug}/agent.json`, name: `${page.name} — Agent manifest`, description: 'Full structured agent-ready data.', mimeType: 'application/json' },
    { uri: `${baseUrl}/${page.slug}/llms.txt`, name: `${page.name} — llms.txt`, description: 'Plain-text agent context.', mimeType: 'text/plain' },
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

/** Handle one JSON-RPC MCP request for a page. Pure. */
export function handleMcpRequest(page: AgentPage, baseUrl: string, req: JsonRpcRequest): JsonRpcResponse {
  const id = req.id ?? null
  const method = req.method || ''

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
      return ok(id, { tools: tools() })
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
        const useOriginal = offer.prefer_original_for_this || (page.prefer_original_site && !!offer.url)
        const target = useOriginal && offer.url ? offer.url : `${baseUrl}${getCheckoutPath(page.slug, offer.kind, offer.index)}`
        return ok(id, { content: [{ type: 'text', text: `Booking target for "${offer.name}": ${target}` }] })
      }
      if (name === 'negotiate_offer') {
        return ok(id, {
          content: [{ type: 'text', text: `POST ${baseUrl}/api/negotiations with slug="${page.slug}", offer="${offerKey || 'services-0'}", plus query/budget/timeline.` }],
        })
      }
      return err(id, -32601, `Unknown tool: ${name}`)
    }
    default:
      return err(id, -32601, `Method not found: ${method}`)
  }
}
