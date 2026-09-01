import { describe, expect, it } from 'vitest'
import {
  A2A_ENDPOINT_PATH,
  A2A_PROTOCOL_BINDING,
  A2A_PROTOCOL_VERSION,
} from './a2a/discovery'
import { buildA2AAgentCard } from './agent-cards'
import { agentRuntimeUrl, marketingUrl } from './site'

describe('A2A Agent Card contract', () => {
  it('describes only the future Nexez v1 JSON-RPC interface', () => {
    const card = buildA2AAgentCard()
    const endpoint = agentRuntimeUrl(A2A_ENDPOINT_PATH)

    expect(card).toMatchObject({
      supportedInterfaces: [
        {
          url: endpoint,
          protocolBinding: A2A_PROTOCOL_BINDING,
          protocolVersion: A2A_PROTOCOL_VERSION,
        },
      ],
      documentationUrl: marketingUrl('/developers'),
      capabilities: {
        streaming: false,
        pushNotifications: false,
        extendedAgentCard: false,
      },
      securitySchemes: {
        nexezApiKey: {
          httpAuthSecurityScheme: {
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
    })

    expect(card).not.toHaveProperty('protocolVersion')
    expect(card).not.toHaveProperty('url')
    expect(card).not.toHaveProperty('preferredTransport')
    expect(card).not.toHaveProperty('additionalInterfaces')

    const serialized = JSON.stringify(card)
    expect(serialized).not.toContain('/api/v1')
    expect(serialized).not.toContain('"0.3"')
    expect(serialized).not.toContain('"transport":"mcp"')
    expect(serialized).not.toContain('"transport":"openapi"')
  })

  it('keeps action skills inside Nexxi approval boundaries', () => {
    const card = buildA2AAgentCard()
    const negotiation = card.skills.find((skill) => skill.id === 'negotiation')
    const checkout = card.skills.find((skill) => skill.id === 'checkout')

    expect(negotiation?.description).toMatch(/approval-required/i)
    expect(checkout?.description).toMatch(/approval boundaries/i)
    expect(JSON.stringify(card.skills)).not.toMatch(/execute without approval/i)
  })
})
