import { describe, expect, it } from 'vitest'
import {
  A2A_AGENT_CARD_PROFILE,
  A2A_AGENT_CARD_SPEC_RELEASE,
  inspectA2AAgentCard,
} from './agent-card-conformance'

const validCard = {
  name: 'Nexez Commerce Peer',
  description: 'Finds offers and returns bounded commerce guidance.',
  supportedInterfaces: [{
    url: 'https://agents.example.com/a2a',
    protocolBinding: 'JSONRPC',
    protocolVersion: A2A_AGENT_CARD_PROFILE,
  }],
  provider: {
    organization: 'Example Agents',
    url: 'https://agents.example.com',
  },
  version: '1.2.0',
  documentationUrl: 'https://agents.example.com/docs',
  capabilities: {
    streaming: true,
    pushNotifications: false,
    extendedAgentCard: false,
  },
  defaultInputModes: ['text/plain'],
  defaultOutputModes: ['text/plain', 'application/json'],
  skills: [{
    id: 'commerce-search',
    name: 'Commerce search',
    description: 'Searches merchant offers without inventing price or availability.',
    tags: ['commerce', 'search'],
    examples: ['Find a move-out cleaning service in Dallas.'],
  }],
  securitySchemes: {
    apiKey: {
      apiKeySecurityScheme: {
        description: 'Peer API key.',
        location: 'header',
        name: 'X-Agent-Key',
      },
    },
  },
  securityRequirements: [{ schemes: { apiKey: { list: [] } } }],
}

function issueCodes(value: ReturnType<typeof inspectA2AAgentCard>): string[] {
  return value.issues.map((issue) => issue.code)
}

describe('inspectA2AAgentCard', () => {
  it('accepts a bounded authenticated A2A 1.0 JSON-RPC text peer', () => {
    const result = inspectA2AAgentCard(validCard)

    expect(result).toMatchObject({
      profile: 'a2a-1.0',
      specRelease: A2A_AGENT_CARD_SPEC_RELEASE,
      valid: true,
      compatible: true,
      preferredInterface: {
        url: 'https://agents.example.com/a2a',
        protocolBinding: 'JSONRPC',
        protocolVersion: '1.0',
        tenant: null,
        compatible: true,
      },
      selectedInterface: {
        url: 'https://agents.example.com/a2a',
        protocolBinding: 'JSONRPC',
        protocolVersion: '1.0',
        tenant: null,
        compatible: true,
      },
      protocolVersions: ['1.0'],
      capabilities: {
        streaming: true,
        pushNotifications: false,
        extendedAgentCard: false,
        requiredExtensions: [],
      },
      security: {
        authenticated: true,
        allowsAnonymous: false,
        schemes: ['apiKey'],
        requirementCount: 1,
      },
      skillCount: 1,
      compatibleSkillCount: 1,
      signatures: { count: 0, verified: false },
    })
    expect(result.issues).toEqual([])
  })

  it('separates structural validity from Nexez transport and modality compatibility', () => {
    const result = inspectA2AAgentCard({
      ...validCard,
      supportedInterfaces: [{
        url: 'https://agents.example.com/a2a',
        protocolBinding: 'GRPC',
        protocolVersion: '1.0',
      }],
      defaultInputModes: ['application/json'],
      defaultOutputModes: ['application/json'],
    })

    expect(result.valid).toBe(true)
    expect(result.compatible).toBe(false)
    expect(result.preferredInterface).toMatchObject({ protocolBinding: 'GRPC' })
    expect(result.selectedInterface).toBeNull()
    expect(issueCodes(result)).toEqual(expect.arrayContaining([
      'no_compatible_interface',
      'text_input_not_supported',
      'text_output_not_supported',
      'no_compatible_skill',
    ]))
  })

  it('rejects the retired A2A 0.3 Agent Card field shape', () => {
    const result = inspectA2AAgentCard({
      ...validCard,
      protocolVersion: '0.3.0',
      url: 'https://agents.example.com/a2a',
      preferredTransport: 'HTTP+JSON',
      security: [{ apiKey: [] }],
      capabilities: {
        ...validCard.capabilities,
        stateTransitionHistory: true,
      },
    })

    expect(result.valid).toBe(false)
    expect(result.compatible).toBe(false)
    expect(issueCodes(result).filter((code) => code === 'legacy_field').length)
      .toBeGreaterThanOrEqual(5)
  })

  it('rejects unsafe endpoints, duplicate skills, and dangling security requirements', () => {
    const result = inspectA2AAgentCard({
      ...validCard,
      supportedInterfaces: [{
        url: 'http://10.0.0.7/a2a#secret',
        protocolBinding: 'JSONRPC',
        protocolVersion: '1.0',
      }],
      skills: [validCard.skills[0], validCard.skills[0]],
      securityRequirements: [{ schemes: { missingScheme: { list: [] } } }],
    })

    expect(result.valid).toBe(false)
    expect(result.compatible).toBe(false)
    expect(issueCodes(result)).toEqual(expect.arrayContaining([
      'private_endpoint',
      'insecure_endpoint',
      'url_fragment',
      'duplicate_skill_id',
      'unknown_security_requirement',
    ]))
  })

  it('permits loopback HTTP only as an explicit development warning', () => {
    const result = inspectA2AAgentCard({
      ...validCard,
      supportedInterfaces: [{
        url: 'http://localhost:4100/api/a2a',
        protocolBinding: 'JSONRPC',
        protocolVersion: '1.0',
      }],
    })

    expect(result.valid).toBe(true)
    expect(result.compatible).toBe(true)
    expect(issueCodes(result)).toContain('local_http_endpoint')
  })

  it('keeps required peer extensions fail closed without misclassifying the card as malformed', () => {
    const result = inspectA2AAgentCard({
      ...validCard,
      capabilities: {
        ...validCard.capabilities,
        extensions: [{
          uri: 'urn:example:required-commerce-extension',
          required: true,
          params: { version: 1 },
        }],
      },
    })

    expect(result.valid).toBe(true)
    expect(result.compatible).toBe(false)
    expect(result.capabilities.requiredExtensions).toEqual([
      'urn:example:required-commerce-extension',
    ])
    expect(issueCodes(result)).toContain('required_extension_not_supported')
  })

  it('reports public cards and unverified signatures without claiming identity trust', () => {
    const {
      securitySchemes: _securitySchemes,
      securityRequirements: _securityRequirements,
      ...card
    } = validCard
    const result = inspectA2AAgentCard({
      ...card,
      signatures: [{ protected: 'eyJhbGciOiJFZERTQSJ9', signature: 'abc_123' }],
    })

    expect(result.valid).toBe(true)
    expect(result.compatible).toBe(true)
    expect(result.security).toMatchObject({
      authenticated: false,
      allowsAnonymous: true,
      schemes: [],
    })
    expect(result.signatures).toEqual({ count: 1, verified: false })
    expect(issueCodes(result)).toEqual(expect.arrayContaining([
      'missing_security',
      'signature_not_verified',
    ]))
  })

  it('enforces security-scheme one-of semantics', () => {
    const result = inspectA2AAgentCard({
      ...validCard,
      securitySchemes: {
        broken: {
          apiKeySecurityScheme: { location: 'header', name: 'X-Key' },
          httpAuthSecurityScheme: { scheme: 'Bearer' },
        },
      },
      securityRequirements: [{ schemes: { broken: { list: [] } } }],
    })

    expect(result.valid).toBe(false)
    expect(issueCodes(result)).toContain('security_scheme_oneof')
  })

  it('fails closed on non-object input and caps reported issue volume', () => {
    expect(inspectA2AAgentCard(null)).toMatchObject({
      valid: false,
      compatible: false,
      issues: [{ code: 'invalid_card' }],
    })

    const result = inspectA2AAgentCard({
      ...validCard,
      skills: Array.from({ length: 100 }, (_, index) => ({
        id: index < 90 ? 'duplicate' : '',
        name: '',
        description: '',
        tags: [],
      })),
    })
    expect(result.valid).toBe(false)
    expect(result.issues.length).toBeLessThanOrEqual(64)
    expect(issueCodes(result)).toContain('too_many_skills')
  })

  it('does not let a warning flood hide a structural error beyond the report cap', () => {
    const duplicateModes = Array.from({ length: 16 }, () => 'text/plain')
    const result = inspectA2AAgentCard({
      ...validCard,
      supportedInterfaces: [
        {
          url: 'https://agents.example.com/grpc',
          protocolBinding: 'GRPC',
          protocolVersion: '1.0',
        },
        validCard.supportedInterfaces[0],
      ],
      capabilities: {
        ...validCard.capabilities,
        extensions: Array.from({ length: 32 }, (_, index) => ({
          uri: `urn:example:required-${index}`,
          required: true,
        })),
      },
      defaultInputModes: duplicateModes,
      defaultOutputModes: duplicateModes,
      securitySchemes: undefined,
      securityRequirements: undefined,
      skills: [{
        id: 'missing-required-tags',
        name: 'Broken skill',
        description: 'The late error must still invalidate the card.',
      }],
    })

    expect(result.issues).toHaveLength(64)
    expect(result.issues.every((issue) => issue.level === 'warning')).toBe(true)
    expect(result.valid).toBe(false)
    expect(result.compatible).toBe(false)
  })
})
