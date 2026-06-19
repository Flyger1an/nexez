import { describe, expect, it } from 'vitest'
import {
  NEXEZ_OPENCLAW_PLUGIN,
  NEXEZ_OPENCLAW_SKILL,
  buildAgentDistributionLinks,
} from '../agent-distribution'

describe('agent distribution metadata', () => {
  it('exposes install commands for the OpenClaw plugin and skill', () => {
    expect(NEXEZ_OPENCLAW_PLUGIN.installCommand).toBe(
      'openclaw plugins install clawhub:@nexez/openclaw-nexez',
    )
    expect(NEXEZ_OPENCLAW_SKILL.installCommand).toBe('openclaw skills install nexez-agent-discovery')
  })

  it('builds public agent links from the supplied runtime base', () => {
    const links = buildAgentDistributionLinks('https://agent.nexez.test')

    expect(links.docs_url).toBe('https://nexez.ai/agents')
    expect(links.agent_index_url).toBe('https://agent.nexez.test/agent-pages.json')
    expect(links.agent_search_url_template).toBe('https://agent.nexez.test/api/agent-search?q={query}')
    expect(links.openclaw.plugin.name).toBe('@nexez/openclaw-nexez')
    expect(links.openclaw.skill.slug).toBe('nexez-agent-discovery')
  })
})
