import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildA2AAgentCard, buildMcpServerCard } from '../agent-cards'
import { buildPlatformAgentManifest } from '../platform-agent-manifest'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('buildMcpServerCard', () => {
  it('points at the live /mcp endpoint and cross-links the existing discovery artifacts', () => {
    const card = buildMcpServerCard()
    expect(card.endpoint).toMatch(/\/mcp$/)
    expect(card.transport).toBe('streamable-http')
    expect(card.protocol_version).toBe('2026-07-28')
    expect(card.capabilities.tools).toBe(true)
    expect(card.capabilities.resources).toBe(true)
    expect(card.links.catalog).toMatch(/\/\.well-known\/mcp\.json$/)
    expect(card.links.manifest).toMatch(/\/\.well-known\/agent\.json$/)
    expect(card.links.llms).toMatch(/\/llms\.txt$/)
    expect(card.links.openapi).toMatch(/\/openapi\.json$/)
  })
})

describe('buildA2AAgentCard', () => {
  it('derives identity from the platform manifest (single source of truth)', () => {
    const card = buildA2AAgentCard()
    const manifest = buildPlatformAgentManifest()
    expect(card.name).toBe(manifest.name)
    expect(card.description).toBe(manifest.description)
    expect(card.provider.url).toBe(manifest.url)
  })

  it('declares the commerce skills with ids, tags, and examples', () => {
    const card = buildA2AAgentCard()
    const ids = card.skills.map((skill) => skill.id)
    expect(ids).toEqual(['offer-discovery', 'negotiation', 'checkout'])
    for (const skill of card.skills) {
      expect(skill.name).toBeTruthy()
      expect(skill.description).toBeTruthy()
      expect(skill.tags.length).toBeGreaterThan(0)
      expect(skill.examples.length).toBeGreaterThan(0)
    }
  })

  it('advertises only the JSON-RPC A2A interface at the actual A2A endpoint', () => {
    const card = buildA2AAgentCard()
    expect(card.url).toMatch(/\/api\/a2a$/)
    expect(card.preferredTransport).toBe('JSONRPC')
    expect(card.additionalInterfaces).toEqual([
      { transport: 'JSONRPC', url: card.url },
    ])
    expect(card.securitySchemes.nexezApiKey).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    })
  })

  it('uses the same fail-closed streaming switch as the transport route', () => {
    vi.stubEnv('A2A_STREAMING_ENABLED', 'false')
    expect(buildA2AAgentCard().capabilities.streaming).toBe(false)
    vi.stubEnv('A2A_STREAMING_ENABLED', 'true')
    expect(buildA2AAgentCard().capabilities.streaming).toBe(true)
  })
})
