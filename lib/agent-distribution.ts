import { agentRuntimeUrl, marketingUrl } from './site'

export const NEXEZ_OPENCLAW_PLUGIN = {
  name: '@nexez/openclaw-nexez',
  displayName: 'Nexez OpenClaw Plugin',
  version: '0.1.2',
  installCommand: 'openclaw plugins install clawhub:@nexez/openclaw-nexez',
  purpose: 'Native tools for search, page fetch, checkout validation, and negotiation handoff.',
  tools: [
    'nexez_search',
    'nexez_get_page',
    'nexez_directory',
    'nexez_validate_checkout',
    'nexez_validate_negotiation',
    'nexez_start_checkout',
    'nexez_submit_negotiation',
  ],
} as const

export const NEXEZ_OPENCLAW_SKILL = {
  slug: 'nexez-agent-discovery',
  displayName: 'Nexez Agent Discovery',
  version: '0.1.0',
  installCommand: 'openclaw skills install nexez-agent-discovery',
  purpose: 'Instructions and rubrics for discovering, comparing, and safely acting on Nexez agent pages.',
} as const

export const NEXEZ_TYPESCRIPT_SDK = {
  name: '@nexez/agent-sdk',
  displayName: 'Nexez Agent SDK',
  version: '0.1.0',
  status: 'source_available',
  sourcePath: 'sdk/typescript',
  purpose: 'Typed client helpers for agent search, manifest fetch, checkout dry-run, and negotiation handoff.',
} as const

export function buildAgentDistributionLinks(baseUrl = agentRuntimeUrl('/').replace(/\/$/, '')) {
  return {
    docs_url: marketingUrl('/agents'),
    runtime_base_url: baseUrl,
    llms_url: `${baseUrl}/llms.txt`,
    agent_index_url: `${baseUrl}/agent-pages.json`,
    agent_search_url_template: `${baseUrl}/api/agent-search?q={query}`,
    openapi_url: `${baseUrl}/openapi.json`,
    capabilities_url: `${baseUrl}/.well-known/nexez.json`,
    mcp_discovery_url: `${baseUrl}/.well-known/mcp.json`,
    openclaw: {
      plugin: NEXEZ_OPENCLAW_PLUGIN,
      skill: NEXEZ_OPENCLAW_SKILL,
    },
    sdks: {
      typescript: NEXEZ_TYPESCRIPT_SDK,
    },
  }
}
