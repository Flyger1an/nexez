import { describe, expect, it } from 'vitest'
import { buildA2AAgentCard, buildMcpServerCard } from '../agent-cards'
import { buildPlatformAgentManifest } from '../platform-agent-manifest'

describe('buildMcpServerCard', () => {
  it('points at the live /mcp endpoint and cross-links the existing discovery artifacts', () => {
    const card = buildMcpServerCard()
    expect(card.endpoint).toMatch(/\/mcp$/)
    expect(card.transport).toBe('streamable-http')
    expect(card.protocol_version).toBe('2026-07-28')
    expect(card.capabilities.tools).toBe(true)
    expect(card.capabilities.resources).toBe(true)
    // The card must agree with the artifacts agents already use.
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
    const ids = card.skills.map((s) => s.id)
    expect(ids).toEqual(['offer-discovery', 'negotiation', 'checkout'])
    for (const skill of card.skills) {
      expect(skill.name).toBeTruthy()
      expect(skill.description).toBeTruthy()
      expect(skill.tags.length).toBeGreaterThan(0)
      expect(skill.examples.length).toBeGreaterThan(0)
    }
  })

  it('advertises MCP and OpenAPI as additional interfaces', () => {
    const card = buildA2AAgentCard()
    const transports = card.additionalInterfaces.map((i) => i.transport)
    expect(transports).toContain('mcp')
    expect(transports).toContain('openapi')
  })
})
