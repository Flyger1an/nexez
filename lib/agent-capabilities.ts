import { getBaseUrl } from './agent-page'

export function buildNexezCapabilities() {
  const baseUrl = getBaseUrl()

  return {
    schema_version: 'nexez.capabilities.v1',
    name: 'Nexez',
    description: 'AI-readable discovery, offer manifests, and checkout handoff for published business pages.',
    homepage_url: baseUrl,
    llms_url: `${baseUrl}/llms.txt`,
    openapi_url: `${baseUrl}/openapi.json`,
    agent_index_url: `${baseUrl}/agent-pages.json`,
    search_url_template: `${baseUrl}/api/agent-search?q={query}`,
    endpoints: [
      {
        name: 'Agent search',
        method: 'GET',
        url_template: `${baseUrl}/api/agent-search?q={query}`,
        authentication: 'none',
        purpose: 'Find published pages and offer-level checkout actions from a buyer request.',
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
    ],
    privacy: {
      published_pages_are_public: true,
      checkout_events_are_owner_readable: true,
      service_role_required_in_browser: false,
    },
  }
}

export function buildOpenApiSpec() {
  const baseUrl = getBaseUrl()

  return {
    openapi: '3.1.0',
    info: {
      title: 'Nexez Agent API',
      version: '0.1.0',
      description: 'Discovery and checkout handoff API for AI-readable product and service pages.',
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
                schema: {
                  type: 'object',
                  required: ['slug', 'offer'],
                  properties: {
                    slug: { type: 'string' },
                    offer: { type: 'string', description: 'Offer key such as services-0 or products-0.' },
                    query: { type: 'string', description: 'Optional buyer request or agent context.' },
                    dryRun: {
                      type: 'boolean',
                      description: 'When true, validate and log checkout intent without creating a Stripe session or redirecting.',
                      default: false,
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Provider redirect or Stripe Checkout URL.',
              content: {
                'application/json': {
                  schema: {
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
                  },
                },
              },
            },
            '404': { description: 'Page or offer not found.' },
            '409': { description: 'Checkout is not configured for this offer.' },
          },
        },
      },
    },
    components: {
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
        AgentPageManifest: {
          type: 'object',
          properties: {
            schema_version: { type: 'string' },
            page: { type: 'object' },
            offers: { type: 'array', items: { type: 'object' } },
            faqs: { type: 'array', items: { type: 'object' } },
            plain_text: { type: 'string' },
          },
        },
      },
    },
  }
}
