// Canonical PLATFORM MCP endpoint (nexez.app/mcp): a JSON-RPC 2.0 facade over
// Nexez's existing PUBLIC REST surface, so an MCP-native agent can discover and
// evaluate the whole cross-merchant catalog from one stable URL. It is a thin
// server-side mirror of the OpenClaw plugin: each tool forwards to the real
// public endpoint (no logic duplicated → no drift), forwarding the caller's IP
// so those endpoints' own rate limits key correctly.
//
// v1 exposes only READ + DRY-RUN tools (all already unauthenticated + safe). The
// mutating/charging tools (start_checkout, submit_negotiation) are deliberately
// NOT here — they need a human-approval gate an anonymous endpoint can't enforce;
// the two validate_* tools always force dryRun:true so they never charge or write.
import { MCP_PROTOCOL_VERSION } from './mcp-server'
import { agentRuntimeUrl, marketingUrl } from './site'

type JsonRpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }
type JsonRpcResponse = {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string }
}

const ok = (id: string | number | null, result: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id, result })
const err = (id: string | number | null, code: number, message: string): JsonRpcResponse => ({ jsonrpc: '2.0', id, error: { code, message } })
const textResult = (id: string | number | null, obj: unknown): JsonRpcResponse =>
  ok(id, { content: [{ type: 'text', text: JSON.stringify(obj) }] })

const TOOLS = [
  {
    name: 'nexez_search',
    description: 'Search across all Nexez merchants for services/products matching a buyer request. Returns ranked listings with offers + agent.json URLs.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'What the buyer is looking for' },
        location: { type: 'string', description: 'Optional city/region filter' },
        limit: { type: 'number', description: 'Max results (default 10)' },
        lat: { type: 'number' },
        lng: { type: 'number' },
        category: { type: 'string', enum: ['all', 'professional', 'consumer'] },
        industry: { type: 'string' },
        min_readiness: { type: 'integer', minimum: 0, maximum: 100 },
        min_trust: { type: 'integer', minimum: 0, maximum: 100 },
        verified: { type: 'boolean' },
        supports_checkout: { type: 'boolean' },
        supports_negotiation: { type: 'boolean' },
        price_band: { type: 'string', enum: ['free', 'under_100', '100_500', '500_2000', '2000_plus', 'custom'] },
      },
      required: ['q'],
    },
  },
  {
    name: 'nexez_directory',
    description: 'Browse the cross-merchant Nexez directory (optionally filtered by category, query, minimum readiness, or location).',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['all', 'professional', 'consumer'] },
        q: { type: 'string' },
        min_readiness: { type: 'number' },
        location: { type: 'string' },
      },
    },
  },
  {
    name: 'nexez_get_page',
    description: "Fetch a listing's full structured agent manifest (seller profile, offers, actions) by slug.",
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string', description: 'Listing slug' } },
      required: ['slug'],
    },
  },
  {
    name: 'nexez_validate_checkout',
    description: 'Dry-run a checkout for an offer BEFORE paying — validates the offer, currency, and payment readiness. Never charges.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        offer: { type: 'string', description: 'e.g. services-0 or products-1' },
        query: { type: 'string', description: 'Optional buyer context' },
        offerConfiguration: { type: 'object', description: 'Canonical buyer values required by the target offer configuration schema.' },
        buyerEmail: { type: 'string' },
        buyerReference: { type: 'string' },
      },
      required: ['slug', 'offer'],
    },
  },
  {
    name: 'nexez_validate_negotiation',
    description: 'Dry-run a negotiation proposal against the seller’s rules BEFORE submitting. Returns the rules evaluation. Never writes.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        offer: { type: 'string' },
        query: { type: 'string' },
        budget: { type: 'string' },
        timeline: { type: 'string' },
      },
      required: ['slug', 'offer'],
    },
  },
]

function platformResources(baseUrl: string) {
  return [
    { uri: `${baseUrl}/agent-pages.json`, name: 'Nexez agent index', description: 'Every published agent-ready listing.', mimeType: 'application/json' },
    { uri: `${baseUrl}/.well-known/mcp.json`, name: 'MCP discovery catalog', description: 'Per-listing + per-storefront MCP endpoints.', mimeType: 'application/json' },
    { uri: marketingUrl('/api/directory'), name: 'Nexez directory', description: 'Cross-merchant directory.', mimeType: 'application/json' },
  ]
}

async function fetchJson(url: string, init: RequestInit | undefined, clientIp: string | undefined): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'x-nexez-client': 'platform-mcp/1.0.0',
    ...(init?.headers as Record<string, string> | undefined),
  }
  // Forward the real caller IP so the underlying endpoint's rate limit keys on the
  // buyer-agent, not this server (Vercel would otherwise share one bucket).
  if (clientIp) headers['x-forwarded-for'] = clientIp
  const res = await fetch(url, { ...init, headers })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

/**
 * Handle one JSON-RPC MCP request against the platform surface. tools/call is
 * async (it forwards to the public REST endpoints); everything else is immediate.
 */
export async function handlePlatformMcpRequest(
  req: JsonRpcRequest,
  baseUrl: string,
  opts: { clientIp?: string } = {},
): Promise<JsonRpcResponse> {
  const id = req.id ?? null
  const method = req.method || ''

  switch (method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {} },
        serverInfo: {
          name: 'nexez:platform',
          title: 'Nexez Agentic Commerce',
          version: '1.0.0',
          websiteUrl: 'https://nexez.ai/agents',
          description: 'Search merchants, inspect structured offers, and validate checkout or negotiation before buying.',
          icons: [{ src: 'https://nexez.ai/icon.png', mimeType: 'image/png', sizes: ['512x512'] }],
        },
      })
    case 'ping':
      return ok(id, {})
    case 'tools/list':
      return ok(id, { tools: TOOLS })
    case 'resources/list':
      return ok(id, { resources: platformResources(baseUrl) })
    case 'resources/read': {
      const uri = String(req.params?.uri || '')
      const match = platformResources(baseUrl).find((r) => r.uri === uri)
      if (!match) return err(id, -32602, `Unknown resource: ${uri}`)
      return ok(id, { contents: [{ uri, mimeType: match.mimeType, text: `See ${uri}` }] })
    }
    case 'tools/call': {
      const name = String(req.params?.name || '')
      const args = (req.params?.arguments as Record<string, unknown>) || {}
      const ip = opts.clientIp
      try {
        if (name === 'nexez_search') {
          const u = new URL(marketingUrl('/api/agent-search'))
          for (const k of [
            'q',
            'location',
            'limit',
            'lat',
            'lng',
            'category',
            'industry',
            'min_readiness',
            'min_trust',
            'verified',
            'supports_checkout',
            'supports_negotiation',
            'price_band',
          ]) if (args[k] != null) u.searchParams.set(k, String(args[k]))
          return textResult(id, (await fetchJson(u.toString(), undefined, ip)).body)
        }
        if (name === 'nexez_directory') {
          const u = new URL(marketingUrl('/api/directory'))
          for (const k of ['category', 'q', 'min_readiness', 'location', 'lat', 'lng']) if (args[k] != null) u.searchParams.set(k, String(args[k]))
          return textResult(id, (await fetchJson(u.toString(), undefined, ip)).body)
        }
        if (name === 'nexez_get_page') {
          const slug = String(args.slug || '')
          if (!slug) return err(id, -32602, 'slug is required')
          const { status, body } = await fetchJson(agentRuntimeUrl(`/${encodeURIComponent(slug)}/agent.json`), undefined, ip)
          if (status === 404) return err(id, -32602, `Unknown listing: ${slug}`)
          return textResult(id, body)
        }
        if (name === 'nexez_validate_checkout') {
          // dryRun forced last → a caller can NEVER turn this into a real charge.
          const initial = await fetchJson(
            agentRuntimeUrl('/api/checkout'),
            { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...args, dryRun: true, buyerAgent: 'mcp' }) },
            ip,
          )
          const initialBody = initial.body && typeof initial.body === 'object' && !Array.isArray(initial.body)
            ? initial.body as Record<string, unknown>
            : {}
          if (initial.status === 409 && initialBody.code === 'reservable_resource_checkout_required') {
            const resource = await fetchJson(
              agentRuntimeUrl('/api/reservable-resources/checkout'),
              {
                method: 'POST',
                headers: {
                  'content-type': 'application/json',
                  'idempotency-key': `mcp-resource:${globalThis.crypto.randomUUID()}`,
                },
                body: JSON.stringify({ ...args, dryRun: true, buyerAgent: 'mcp' }),
              },
              ip,
            )
            return textResult(id, resource.body)
          }
          return textResult(id, initial.body)
        }
        if (name === 'nexez_validate_negotiation') {
          const { body } = await fetchJson(
            agentRuntimeUrl('/api/negotiations'),
            { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...args, dryRun: true }) },
            ip,
          )
          return textResult(id, body)
        }
        return err(id, -32601, `Unknown tool: ${name}`)
      } catch {
        return err(id, -32603, 'Tool execution failed.')
      }
    }
    default:
      return err(id, -32601, `Method not found: ${method}`)
  }
}
