import { describe, expect, it } from 'vitest'
import {
  NEXEZ_AGENT_EXAMPLES,
  NEXEZ_OPENCLAW_PLUGIN,
  NEXEZ_OPENCLAW_SKILL,
  NEXEZ_PYTHON_SDK,
  NEXEZ_TYPESCRIPT_SDK,
  buildAgentDistributionLinks,
} from '../agent-distribution'

describe('agent distribution metadata', () => {
  it('exposes install commands for the OpenClaw plugin and skill', () => {
    expect(NEXEZ_OPENCLAW_PLUGIN.installCommand).toBe(
      'openclaw plugins install clawhub:@nexez/openclaw-nexez',
    )
    expect(NEXEZ_OPENCLAW_SKILL.installCommand).toBe('openclaw skills install nexez-agent-discovery')
    expect(NEXEZ_TYPESCRIPT_SDK.name).toBe('@nexez/agent-sdk')
    expect(NEXEZ_OPENCLAW_PLUGIN.version).toBe('0.2.0')
    expect(NEXEZ_OPENCLAW_PLUGIN.tools).toContain('nexez_wait_for_negotiation_decision')
    expect(NEXEZ_TYPESCRIPT_SDK.version).toBe('0.3.0')
    expect(NEXEZ_TYPESCRIPT_SDK.status).toBe('published')
    expect(NEXEZ_TYPESCRIPT_SDK.installCommand).toBe('npm install @nexez/agent-sdk')
    expect(NEXEZ_TYPESCRIPT_SDK.npmUrl).toBe('https://www.npmjs.com/package/@nexez/agent-sdk')
    expect(NEXEZ_PYTHON_SDK.name).toBe('nexez-agent-sdk')
    expect(NEXEZ_PYTHON_SDK.version).toBe('0.3.0')
    expect(NEXEZ_PYTHON_SDK.moduleName).toBe('nexez_agent_sdk')
    expect(NEXEZ_PYTHON_SDK.status).toBe('published')
    expect(NEXEZ_PYTHON_SDK.installCommand).toBe('python -m pip install nexez-agent-sdk')
    expect(NEXEZ_PYTHON_SDK.pypiUrl).toBe('https://pypi.org/project/nexez-agent-sdk/')
    expect(NEXEZ_AGENT_EXAMPLES.sourcePath).toBe('examples/agents')
  })

  it('builds public agent links from the supplied runtime base', () => {
    const links = buildAgentDistributionLinks('https://agent.nexez.test')

    expect(links.docs_url).toBe('https://nexez.ai/agents')
    expect(links.agent_index_url).toBe('https://agent.nexez.test/agent-pages.json')
    expect(links.agent_search_url_template).toBe('https://agent.nexez.test/api/agent-search?q={query}')
    expect(links.openclaw.plugin.name).toBe('@nexez/openclaw-nexez')
    expect(links.openclaw.skill.slug).toBe('nexez-agent-discovery')
    expect(links.sdks.typescript.sourcePath).toBe('sdk/typescript')
    expect(links.sdks.typescript.version).toBe('0.3.0')
    expect(links.sdks.typescript.installCommand).toBe('npm install @nexez/agent-sdk')
    expect(links.sdks.python.sourcePath).toBe('sdk/python')
    expect(links.sdks.python.version).toBe('0.3.0')
    expect(links.sdks.python.status).toBe('published')
    expect(links.sdks.python.installCommand).toBe('python -m pip install nexez-agent-sdk')
    expect(links.examples.sourcePath).toBe('examples/agents')
  })
})
