import { agentRuntimeUrl, marketingUrl } from './site'

export const NEXEZ_REPOSITORY_URL = 'https://github.com/Flyger1an/nexez'

export const NEXEZ_OPENCLAW_PLUGIN = {
  name: '@nexez/openclaw-nexez',
  displayName: 'Nexez OpenClaw Plugin',
  version: '0.2.0',
  installCommand: 'openclaw plugins install clawhub:@nexez/openclaw-nexez',
  purpose: 'Native tools for search, page fetch, checkout validation, and negotiation handoff.',
  tools: [
    'nexez_search',
    'nexez_get_page',
    'nexez_directory',
    'nexez_get_negotiation_status',
    'nexez_wait_for_negotiation_decision',
    'nexez_validate_checkout',
    'nexez_validate_negotiation',
    'nexez_start_checkout',
    'nexez_submit_negotiation',
  ],
} as const

export const NEXEZ_OPENCLAW_SKILL = {
  slug: 'nexez-agent-discovery',
  displayName: 'Nexez Agent Discovery',
  version: '0.3.0',
  installCommand: 'openclaw skills install nexez-agent-discovery',
  purpose: 'Instructions and rubrics for discovering, comparing, and safely acting on Nexez agent pages.',
} as const

export const NEXEZ_TYPESCRIPT_SDK = {
  name: '@nexez/agent-sdk',
  displayName: 'Nexez Agent SDK',
  version: '0.3.0',
  status: 'published',
  installCommand: 'npm install @nexez/agent-sdk',
  npmUrl: 'https://www.npmjs.com/package/@nexez/agent-sdk',
  sourcePath: 'sdk/typescript',
  sourceUrl: `${NEXEZ_REPOSITORY_URL}/tree/main/sdk/typescript`,
  purpose: 'Typed client helpers for agent search, manifest fetch, checkout dry-run, and negotiation handoff.',
} as const

export const NEXEZ_PYTHON_SDK = {
  name: 'nexez-agent-sdk',
  moduleName: 'nexez_agent_sdk',
  displayName: 'Nexez Python Agent SDK',
  version: '0.3.0',
  status: 'published',
  installCommand: 'python -m pip install nexez-agent-sdk',
  pypiUrl: 'https://pypi.org/project/nexez-agent-sdk/',
  sourcePath: 'sdk/python',
  sourceUrl: `${NEXEZ_REPOSITORY_URL}/tree/main/sdk/python`,
  localInstallCommand: 'python -m pip install -e sdk/python',
  purpose: 'Dependency-free Python helpers for agent search, manifest fetch, checkout dry-run, and negotiation handoff.',
} as const

export const NEXEZ_AGENT_EXAMPLES = {
  sourcePath: 'examples/agents',
  sourceUrl: `${NEXEZ_REPOSITORY_URL}/tree/main/examples/agents`,
  purpose: 'Copy-paste buyer-agent workflows for search, validation, negotiation submission, and status polling.',
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
    examples: NEXEZ_AGENT_EXAMPLES,
    sdks: {
      typescript: NEXEZ_TYPESCRIPT_SDK,
      python: NEXEZ_PYTHON_SDK,
    },
  }
}
