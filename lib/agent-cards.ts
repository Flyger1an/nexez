import { buildPlatformAgentManifest } from './platform-agent-manifest'
import { agentRuntimeUrl, marketingUrl } from './site'

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
      'MCP server for agent commerce on Nexez: discover structured business offers, compare and negotiate, and route checkout and booking intent.',
    endpoint: agentRuntimeUrl('/mcp'),
    transport: 'streamable-http',
    authentication: { required: false },
    capabilities: { tools: true, resources: false, prompts: false },
    links: {
      catalog: agentRuntimeUrl('/.well-known/mcp.json'),
      manifest: agentRuntimeUrl('/.well-known/agent.json'),
      llms: agentRuntimeUrl('/llms.txt'),
      openapi: agentRuntimeUrl('/openapi.json'),
      support: marketingUrl('/support'),
    },
  }
}

/** A2A-style agent card for clients probing /.well-known/agent-card.json. */
export function buildA2AAgentCard() {
  const manifest = buildPlatformAgentManifest()
  return {
    protocolVersion: '0.3.0',
    name: manifest.name,
    description: manifest.description,
    url: agentRuntimeUrl('/api/v1'),
    preferredTransport: 'HTTP+JSON',
    provider: {
      organization: 'Nexez',
      url: manifest.url,
    },
    version: '1.0.0',
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    defaultInputModes: ['application/json', 'text/plain'],
    defaultOutputModes: ['application/json'],
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
        description: 'Submit a proposal against a negotiable offer, poll the seller decision, and continue the thread to agreement.',
        tags: ['commerce', 'negotiation'],
        examples: ['Offer $450 for the consulting package with a 10-day timeline.'],
      },
      {
        id: 'checkout',
        name: 'Checkout and booking handoff',
        description: 'Start a checkout or booking for a listed offer and receive a durable order reference.',
        tags: ['commerce', 'checkout', 'booking'],
        examples: ['Book the Discovery Call and send the confirmation link.'],
      },
    ],
    documentationUrl: agentRuntimeUrl('/llms.txt'),
    additionalInterfaces: [
      { transport: 'mcp', url: agentRuntimeUrl('/mcp') },
      { transport: 'openapi', url: agentRuntimeUrl('/openapi.json') },
    ],
  }
}
