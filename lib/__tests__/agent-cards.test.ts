import { describe, expect, it } from 'vitest'
import {
  A2A_ENDPOINT_PATH,
  A2A_PROTOCOL_BINDING,
  A2A_PROTOCOL_VERSION,
  A2A_STREAMING_DEPLOYED,
  A2A_TRANSPORT_DEPLOYED,
} from '../a2a/discovery'
import { buildA2AAgentCard, buildMcpServerCard } from '../agent-cards'
import { buildPlatformAgentManifest } from '../platform-agent-manifest'
import { agentRuntimeUrl } from '../site'

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
  it('derives identity from the platform manifest', () => {
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

  it('declares only the deployed A2A v1 JSON-RPC interface', () => {
    expect(A2A_TRANSPORT_DEPLOYED).toBe(true)
    const card = buildA2AAgentCard()
    expect(card.supportedInterfaces).toEqual([
      {
        url: agentRuntimeUrl(A2A_ENDPOINT_PATH),
        protocolBinding: A2A_PROTOCOL_BINDING,
        protocolVersion: A2A_PROTOCOL_VERSION,
      },
    ])
    expect(card.supportedInterfaces[0]?.url).toMatch(/\/api\/v1\/a2a$/)
    expect('additionalInterfaces' in card).toBe(false)
    expect('preferredTransport' in card).toBe(false)
    expect(JSON.stringify(card)).not.toContain('"transport":"mcp"')
    expect(JSON.stringify(card)).not.toContain('"transport":"openapi"')
  })

  it('advertises exactly the streaming behavior implemented by the transport', () => {
    expect(A2A_STREAMING_DEPLOYED).toBe(true)
    expect(buildA2AAgentCard().capabilities).toEqual({
      streaming: true,
      pushNotifications: false,
      extendedAgentCard: false,
    })
  })
})
