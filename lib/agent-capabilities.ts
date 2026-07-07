import { getBaseUrl, getCheckoutOffers, type AgentPage } from './agent-page'
import { buildAgentDistributionLinks } from './agent-distribution'
import { agentArtifactHref } from './custom-domain'

export function buildNexezCapabilities() {
  const baseUrl = getBaseUrl()
  const distribution = buildAgentDistributionLinks(baseUrl)

  return {
    schema_version: 'nexez.capabilities.v1',
    name: 'Nexez',
    description: 'AI-readable discovery, offer manifests, and checkout handoff for published business pages.',
    homepage_url: baseUrl,
    agent_access_url: distribution.docs_url,
    llms_url: `${baseUrl}/llms.txt`,
    openapi_url: `${baseUrl}/openapi.json`,
    agent_index_url: `${baseUrl}/agent-pages.json`,
    mcp_discovery_url: `${baseUrl}/.well-known/mcp.json`,
    search_url_template: `${baseUrl}/api/agent-search?q={query}`,
    openclaw: distribution.openclaw,
    sdks: distribution.sdks,
    examples: distribution.examples,
    endpoints: [
      {
        name: 'Agent search',
        method: 'GET',
        url_template: `${baseUrl}/api/agent-search?q={query}`,
        authentication: 'none',
        purpose: 'Find published pages and offer-level checkout actions from a buyer request.',
      },
      {
        name: 'MCP discovery catalog',
        method: 'GET',
        url_template: `${baseUrl}/.well-known/mcp.json`,
        authentication: 'none',
        purpose: 'List published pages that expose MCP-compatible resources and offer tools.',
      },
      {
        name: 'Agent page manifest',
        method: 'GET',
        url_template: `${baseUrl}/{slug}/agent.json`,
        authentication: 'none',
        purpose: 'Read complete structured seller, offer, FAQ, and checkout context for one published page.',
      },
      {
        name: 'Agent checkout handoff',
        method: 'POST',
        url_template: `${baseUrl}/api/checkout`,
        authentication: 'none',
        purpose: 'Create a Stripe Checkout Session when configured, redirect/log a provider checkout handoff, or dry-run the handoff for testing.',
        supports_dry_run: true,
      },
      {
        name: 'Agent negotiation',
        method: 'POST',
        url_template: `${baseUrl}/api/negotiations`,
        authentication: 'none',
        purpose: 'Submit buyer-agent proposal terms for seller review before checkout or future escrow hold.',
        supports_dry_run: true,
      },
    ],
    privacy: {
      published_pages_are_public: true,
      checkout_events_are_owner_readable: true,
      service_role_required_in_browser: false,
    },
  }
}

// Request/response schema pieces shared by the global spec and the per-page
// spec so the two can never drift. `pin` narrows slug/offer to one page's real
// values (enums), which is the whole point of the scoped spec: an agent reading
// acme.com/openapi.json sees exactly which offer keys exist.
function checkoutRequestSchema(pin?: { slug: string; offerKeys: string[]; offerLegend: string }) {
  return {
    type: 'object',
    required: ['slug', 'offer'],
    properties: {
      slug: pin ? { type: 'string', enum: [pin.slug], default: pin.slug } : { type: 'string' },
      offer: pin && pin.offerKeys.length
        ? { type: 'string', enum: pin.offerKeys, description: `Offer key. ${pin.offerLegend}` }
        : { type: 'string', description: 'Offer key such as services-0 or products-0.' },
      query: { type: 'string', description: 'Optional buyer request or agent context.' },
      buyerEmail: { type: 'string', description: 'Optional buyer email. Prefills Stripe checkout and enables the buyer receipt + order portal.' },
      buyerName: { type: 'string', description: 'Optional buyer or business name recorded on the order.' },
      buyerReference: { type: 'string', description: 'Optional buyer-side reference / order id; also stamped on the Stripe session (client_reference_id).' },
      buyerAgent: { type: 'string', description: 'Optional identifier for the buying agent.' },
      dryRun: {
        type: 'boolean',
        description: 'When true, validate and log checkout intent without creating a Stripe session or redirecting.',
        default: false,
      },
    },
  }
}

function negotiationRequestSchema(pin?: { slug: string; offerKeys: string[] }) {
  return {
    type: 'object',
    required: ['slug', 'offer'],
    properties: {
      slug: pin ? { type: 'string', enum: [pin.slug], default: pin.slug } : { type: 'string' },
      offer: pin && pin.offerKeys.length ? { type: 'string', enum: pin.offerKeys } : { type: 'string' },
      buyerAgent: { type: 'string' },
      query: { type: 'string' },
      requestedTerms: { type: 'object', additionalProperties: true },
      budget: { type: 'string' },
      timeline: { type: 'string' },
      contact: { type: 'string' },
      dryRun: { type: 'boolean', default: false },
    },
  }
}

const CHECKOUT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    url: { type: 'string' },
    ok: { type: 'boolean' },
    provider: { type: 'string' },
    checkoutUrl: { type: 'string' },
    actionUrl: { type: ['string', 'null'] },
    stripeConfigured: { type: 'boolean' },
    checkoutSessionId: { type: 'string' },
    events: { type: 'object', additionalProperties: { type: 'boolean' } },
  },
}

const AGENT_PAGE_MANIFEST_SCHEMA = {
  type: 'object',
  properties: {
    schema_version: { type: 'string' },
    page: { type: 'object' },
    offers: { type: 'array', items: { type: 'object' } },
    faqs: { type: 'array', items: { type: 'object' } },
    plain_text: { type: 'string' },
  },
}

const AGENT_NEGOTIATION_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    id: { type: 'string' },
    status: { type: 'string' },
    escrowMode: { type: 'string' },
    stripeConfigured: { type: 'boolean' },
    next: { type: 'string' },
    publicPageUrl: { type: 'string' },
  },
}

export function buildOpenApiSpec() {
  const baseUrl = getBaseUrl()
  const distribution = buildAgentDistributionLinks(baseUrl)

  return {
    openapi: '3.1.0',
    info: {
      title: 'Nexez Agent API',
      version: '0.1.0',
      description: 'Discovery and checkout handoff API for AI-readable product and service pages.',
      'x-nexez-agent-distribution': distribution,
    },
    servers: [{ url: baseUrl }],
    paths: {
      '/api/agent-search': {
        get: {
          summary: 'Search published agent pages and offers',
          operationId: 'searchAgentPages',
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'Buyer request or search query, such as strategy session or consulting.',
            },
            {
              name: 'limit',
              in: 'query',
              required: false,
              schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
            },
            {
              name: 'location',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'City, region, or service area to filter results, such as Chicago, IL or Austin, TX.',
            },
            {
              name: 'lat',
              in: 'query',
              required: false,
              schema: { type: 'number' },
              description: 'Optional buyer latitude for future location-aware clients. Use with location when available.',
            },
            {
              name: 'lng',
              in: 'query',
              required: false,
              schema: { type: 'number' },
              description: 'Optional buyer longitude for future location-aware clients. Use with location when available.',
            },
          ],
          responses: {
            '200': {
              description: 'Offer-level matches with checkout URLs and page manifests.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AgentSearchResponse' },
                },
              },
            },
          },
        },
      },
      '/agent-pages.json': {
        get: {
          summary: 'List published agent pages',
          operationId: 'listAgentPages',
          responses: {
            '200': {
              description: 'Published page index with manifest and checkout URLs.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AgentPageIndex' },
                },
              },
            },
          },
        },
      },
      '/.well-known/mcp.json': {
        get: {
          summary: 'List MCP-enabled agent pages',
          operationId: 'listMcpEnabledAgentPages',
          responses: {
            '200': {
              description: 'Discovery catalog for pages exposing MCP-compatible resources.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/McpDiscoveryCatalog' },
                },
              },
            },
          },
        },
      },
      '/{slug}/agent.json': {
        get: {
          summary: 'Read one published page manifest',
          operationId: 'getAgentPageManifest',
          parameters: [
            {
              name: 'slug',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Structured seller, offer, FAQ, and checkout context.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AgentPageManifest' },
                },
              },
            },
            '404': { description: 'No published page for this slug.' },
          },
        },
      },
      '/api/checkout': {
        post: {
          summary: 'Start checkout handoff for an offer',
          operationId: 'startAgentCheckout',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: checkoutRequestSchema(),
              },
            },
          },
          responses: {
            '200': {
              description: 'Provider redirect or Stripe Checkout URL.',
              content: {
                'application/json': {
                  schema: CHECKOUT_RESPONSE_SCHEMA,
                },
              },
            },
            '404': { description: 'Page or offer not found.' },
            '409': { description: 'Checkout is not configured for this offer.' },
          },
        },
      },
      '/api/negotiations': {
        post: {
          summary: 'Create an agent-to-agent proposal',
          operationId: 'createAgentNegotiation',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: negotiationRequestSchema(),
              },
            },
          },
          responses: {
            '200': {
              description: 'Negotiation created or validated.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AgentNegotiationResponse' },
                },
              },
            },
            '412': { description: 'Negotiation table migration has not been applied.' },
          },
        },
      },
      '/api/v1/pages': {
        get: {
          summary: 'List your pages (programmatic API)',
          operationId: 'listOwnerPages',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Pages owned by the authenticated API key.',
              content: { 'application/json': { schema: { type: 'object', properties: { pages: { type: 'array', items: { type: 'object' } } } } } },
            },
            '401': { description: 'Missing, invalid, or revoked API key.' },
            '503': { description: 'Programmatic API not configured on this deployment.' },
          },
        },
        post: {
          summary: 'Create a page (programmatic API)',
          operationId: 'createOwnerPage',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string' },
                    slug: { type: 'string', description: 'Optional; auto-generated + de-duplicated if omitted.' },
                    description: { type: 'string' },
                    website_url: { type: 'string' },
                    industry: { type: 'string' },
                    services: { type: 'array', items: { type: 'object' } },
                    products: { type: 'array', items: { type: 'object' } },
                    faqs: { type: 'array', items: { type: 'object' } },
                    is_published: { type: 'boolean', default: false, description: 'Defaults to draft.' },
                    custom_domain: { type: 'string' },
                    domain_path: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Created page + public URL.',
              content: { 'application/json': { schema: { type: 'object', properties: { page: { type: 'object' }, url: { type: 'string' } } } } },
            },
            '400': { description: 'Missing name or invalid body.' },
            '401': { description: 'Missing, invalid, or revoked API key.' },
            '503': { description: 'Programmatic API not configured on this deployment.' },
          },
        },
      },
      '/api/v1/pages/{id}': {
        get: {
          summary: 'Get one of your pages (programmatic API)',
          operationId: 'getOwnerPage',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'The page.', content: { 'application/json': { schema: { type: 'object', properties: { page: { type: 'object' } } } } } },
            '401': { description: 'Missing, invalid, or revoked API key.' },
            '404': { description: 'Page not found for this owner.' },
            '503': { description: 'Programmatic API not configured on this deployment.' },
          },
        },
        patch: {
          summary: 'Update one of your pages (programmatic API)',
          operationId: 'updateOwnerPage',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', description: 'Any writable page fields (name, description, services, products, faqs, is_published, custom_domain, domain_path, ...).' } } },
          },
          responses: {
            '200': { description: 'Updated page + public URL.', content: { 'application/json': { schema: { type: 'object', properties: { page: { type: 'object' }, url: { type: 'string' } } } } } },
            '400': { description: 'No writable fields or invalid body.' },
            '401': { description: 'Missing, invalid, or revoked API key.' },
            '404': { description: 'Page not found for this owner.' },
            '503': { description: 'Programmatic API not configured on this deployment.' },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'nxz_live_…',
          description: 'Nexez API key. Create one in Dashboard → Tools → Developer Platform. Send as: Authorization: Bearer nxz_live_…',
        },
      },
      schemas: {
        AgentSearchResponse: {
          type: 'object',
          properties: {
            schema_version: { type: 'string' },
            query: { type: 'string' },
            result_count: { type: 'integer' },
            results: {
              type: 'array',
              items: { $ref: '#/components/schemas/AgentSearchResult' },
            },
          },
        },
        AgentSearchResult: {
          type: 'object',
          properties: {
            score: { type: 'number' },
            page: { type: 'object' },
            offer: { type: ['object', 'null'] },
          },
        },
        AgentPageIndex: {
          type: 'object',
          properties: {
            schema_version: { type: 'string' },
            llms_url: { type: 'string' },
            openapi_url: { type: 'string' },
            pages: { type: 'array', items: { type: 'object' } },
          },
        },
        McpDiscoveryCatalog: {
          type: 'object',
          properties: {
            schema_version: { type: 'string' },
            generated_at: { type: 'string' },
            protocol_note: { type: 'string' },
            homepage_url: { type: 'string' },
            llms_url: { type: 'string' },
            capabilities_url: { type: 'string' },
            agent_index_url: { type: 'string' },
            page_count: { type: 'integer' },
            pages: { type: 'array', items: { type: 'object' } },
          },
        },
        AgentPageManifest: AGENT_PAGE_MANIFEST_SCHEMA,
        AgentNegotiationResponse: AGENT_NEGOTIATION_RESPONSE_SCHEMA,
      },
    },
  }
}

/**
 * Per-page OpenAPI spec - the domain-scoped counterpart to the global
 * /openapi.json. Served at /<slug>/openapi.json and, on a verified custom
 * domain, at the brand root /openapi.json (middleware rewrite), so an agent
 * reading acme.com sees ONLY acme's surface: slug and offer keys pinned to
 * this page's real values, negotiation advertised only when the plan allows it
 * (matching llms.txt/agent.json gating). Transactional endpoints stay on the
 * platform server; identity links reflect the brand domain.
 */
export function buildPageOpenApiSpec(
  page: AgentPage,
  opts: {
    platformBase?: string
    identityBase?: string
    onCustomHost?: boolean
    domainPath?: string
    negotiationAllowed?: boolean
  } = {},
) {
  const platformBase = opts.platformBase || getBaseUrl()
  const identityBase = opts.identityBase || platformBase
  const onCustomHost = opts.onCustomHost === true
  const domainPath = opts.domainPath || '/'
  const negotiationAllowed = opts.negotiationAllowed === true

  const offers = getCheckoutOffers(page)
  const offerKeys = offers.map((o) => `${o.kind}-${o.index}`)
  const offerLegend = offers
    .map((o) => `${o.kind}-${o.index} = ${String(o.name || 'Offer').slice(0, 80)}${o.price ? ` (${String(o.price).slice(0, 40)})` : ''}`)
    .join('; ')
    .slice(0, 1500)
  const pin = { slug: page.slug, offerKeys, offerLegend }

  const selfUrl = onCustomHost
    ? `${identityBase}${domainPath === '/' ? '' : domainPath}`
    : `${identityBase}/${page.slug}`
  const link = (artifact: 'agent.json' | 'llms.txt' | 'openapi.json') =>
    `${identityBase}${agentArtifactHref(artifact, page.slug, onCustomHost, domainPath)}`

  return {
    openapi: '3.1.0',
    info: {
      title: `${page.name || page.slug} - Nexez agent API`,
      version: '0.1.0',
      description: `Checkout and manifest API scoped to one published listing: ${String(page.description || page.name || page.slug).slice(0, 300)}`,
      'x-nexez-page': {
        slug: page.slug,
        url: selfUrl,
        agent_json_url: link('agent.json'),
        llms_url: link('llms.txt'),
        openapi_url: link('openapi.json'),
        global_openapi_url: `${platformBase}/openapi.json`,
      },
    },
    // Transactional endpoints always run on the platform host - a brand-domain
    // request still checks out through the Nexez runtime (Stripe, order rows).
    servers: [{ url: platformBase }],
    paths: {
      [`/${page.slug}/agent.json`]: {
        get: {
          summary: 'Read this page\'s manifest',
          operationId: 'getAgentPageManifest',
          responses: {
            '200': {
              description: 'Structured seller, offer, FAQ, and checkout context.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AgentPageManifest' },
                },
              },
            },
            '404': { description: 'No published page for this slug.' },
          },
        },
      },
      '/api/checkout': {
        post: {
          summary: `Start checkout for a ${page.name || page.slug} offer`,
          operationId: 'startAgentCheckout',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: checkoutRequestSchema(pin),
              },
            },
          },
          responses: {
            '200': {
              description: 'Provider redirect or Stripe Checkout URL.',
              content: {
                'application/json': {
                  schema: CHECKOUT_RESPONSE_SCHEMA,
                },
              },
            },
            '404': { description: 'Page or offer not found.' },
            '409': { description: 'Checkout is not configured for this offer.' },
          },
        },
      },
      // Advertised only when the plan allows negotiation AND a negotiable offer
      // exists - otherwise the endpoint 403s (matches llms.txt + agent.json).
      ...(negotiationAllowed
        ? {
            '/api/negotiations': {
              post: {
                summary: `Open a proposal with ${page.name || page.slug}`,
                operationId: 'createAgentNegotiation',
                requestBody: {
                  required: true,
                  content: {
                    'application/json': {
                      schema: negotiationRequestSchema(pin),
                    },
                  },
                },
                responses: {
                  '200': {
                    description: 'Negotiation created or validated.',
                    content: {
                      'application/json': {
                        schema: { $ref: '#/components/schemas/AgentNegotiationResponse' },
                      },
                    },
                  },
                  '412': { description: 'Negotiation table migration has not been applied.' },
                },
              },
            },
          }
        : {}),
    },
    components: {
      schemas: {
        AgentPageManifest: AGENT_PAGE_MANIFEST_SCHEMA,
        ...(negotiationAllowed ? { AgentNegotiationResponse: AGENT_NEGOTIATION_RESPONSE_SCHEMA } : {}),
      },
    },
  }
}
