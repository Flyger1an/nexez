import { buildPlatformAgentManifest } from './platform-agent-manifest'
import { MCP_PROTOCOL_VERSION } from './mcp-transport'
import { agentRuntimeUrl, marketingUrl } from './site'
import {
  A2A_ENDPOINT_PATH,
  A2A_PROTOCOL_BINDING,
  A2A_PROTOCOL_VERSION,
} from './a2a/discovery'

/**
 * Newer agent-discovery documents that crawlers and agent frameworks probe for
 * beyond the original /.well-known/agent.json + mcp.json pair. Production logs
 * show steady 404s on both paths served here (MCP clients probing
 * /.well-known/mcp/server-card.json and /.well-known/mcp; A2A clients probing
 * /.well-known/agent-card.json). Everything is derived from the same site
 * helpers + platform manifest as the existing artifacts so the surfaces can
 * never disagree about endpoints.
 */

/** MCP server card: describes the /mcp endpoint itself (not the listing catalog). */
export function buildMcpServerCard() {
  return {
    schema_version: '1.0',
    name: 'Nexez',
    title: 'Nexez Agent Commerce MCP Server',
    description:
      'Find Nexez sellers, inspect published offers, and validate checkout or negotiation before a buyer-approved handoff.',
    endpoint: agentRuntimeUrl('/mcp'),
    transport: 'streamable-http',
    protocol_version: MCP_PROTOCOL_VERSION,
    authentication: { required: false },
    capabilities: { tools: true, resources: true, prompts: false },
    links: {
      catalog: agentRuntimeUrl('/.well-known/mcp.json'),
      manifest: agentRuntimeUrl('/.well-known/agent.json'),
      llms: agentRuntimeUrl('/llms.txt'),
      openapi: agentRuntimeUrl('/openapi.json'),
      support: marketingUrl('/support'),
    },
  }
}

/**
 * Future A2A v1 Agent Card for the API-key-authenticated Nexxi runtime.
 * The well-known route serves this only after A2A_TRANSPORT_DEPLOYED is true.
 */
export function buildA2AAgentCard() {
  const manifest = buildPlatformAgentManifest()
  const endpoint = agentRuntimeUrl(A2A_ENDPOINT_PATH)
  return {
    name: manifest.name,
    description: manifest.description,
    supportedInterfaces: [
      {
        url: endpoint,
        protocolBinding: A2A_PROTOCOL_BINDING,
        protocolVersion: A2A_PROTOCOL_VERSION,
      },
    ],
    provider: {
      organization: 'Nexez',
      url: manifest.url,
    },
    version: '1.0.0',
    documentationUrl: marketingUrl('/developers'),
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extendedAgentCard: false,
    },
    securitySchemes: {
      nexezApiKey: {
        httpAuthSecurityScheme: {
          description: 'Nexez Pro API key created in the authenticated dashboard.',
          scheme: 'Bearer',
          bearerFormat: 'nxz_live_...',
        },
      },
    },
    securityRequirements: [
      {
        schemes: {
          nexezApiKey: { list: [] },
        },
      },
    ],
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills: [
      {
        id: 'offer-discovery',
        name: 'Offer discovery',
        description: 'Search and compare agent-readable products and services across published Nexez storefronts.',
        tags: ['commerce', 'search', 'catalog'],
        examples: ['Find dog grooming services in London under $100.'],
      },
      {
        id: 'negotiation',
        name: 'Price negotiation',
        description: 'Prepare a buyer proposal against a negotiable offer and return an approval-required action.',
        tags: ['commerce', 'negotiation', 'approval'],
        examples: ['Offer $450 for the consulting package with a 10-day timeline.'],
      },
      {
        id: 'checkout',
        name: 'Checkout and booking handoff',
        description: 'Prepare a checkout or booking handoff while preserving Nexxi buyer approval boundaries.',
        tags: ['commerce', 'checkout', 'booking', 'approval'],
        examples: ['Book the Discovery Call and return the approval request.'],
      },
    ],
  }
}
