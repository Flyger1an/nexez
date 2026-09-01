import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  A2A_AGENT_CARD_SPEC_RELEASE,
  MAX_A2A_AGENT_CARD_BYTES,
} from '../../../../../lib/a2a/agent-card-conformance'

let rateLimited = false
const captureEvent = vi.fn()

vi.mock('../../../../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => (
    rateLimited ? new Response('rate', { status: 429 }) : null
  )),
}))
vi.mock('../../../../../lib/observability', () => ({
  captureEvent: (...args: unknown[]) => captureEvent(...args),
}))

import { POST } from './route'

const validCard = {
  name: 'Nexez Commerce Peer',
  description: 'Returns bounded commerce guidance.',
  supportedInterfaces: [{
    url: 'https://agents.example.com/a2a',
    protocolBinding: 'JSONRPC',
    protocolVersion: '1.0',
  }],
  version: '1.0.0',
  capabilities: {
    streaming: true,
    pushNotifications: false,
    extendedAgentCard: false,
  },
  defaultInputModes: ['text/plain'],
  defaultOutputModes: ['text/plain'],
  skills: [{
    id: 'commerce-search',
    name: 'Commerce search',
    description: 'Searches merchant offers.',
    tags: ['commerce'],
  }],
  securitySchemes: {
    apiKey: {
      apiKeySecurityScheme: {
        description: 'Secret header supplied by the peer.',
        location: 'header',
        name: 'X-Agent-Key',
      },
    },
  },
  securityRequirements: [{ schemes: { apiKey: { list: [] } } }],
}

function post(
  body: string,
  headers: Record<string, string> = {},
) {
  return new Request('https://nexez.test/api/a2a/agent-card/validate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  })
}

describe('POST /api/a2a/agent-card/validate', () => {
  beforeEach(() => {
    rateLimited = false
    vi.clearAllMocks()
  })

  it('fails before parsing when the public validator is rate limited', async () => {
    rateLimited = true
    const response = await POST(post(JSON.stringify(validCard)))

    expect(response.status).toBe(429)
    expect(captureEvent).not.toHaveBeenCalled()
  })

  it('requires a JSON media type', async () => {
    const response = await POST(post(JSON.stringify(validCard), {
      'content-type': 'text/plain',
    }))

    expect(response.status).toBe(415)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(captureEvent).not.toHaveBeenCalled()
  })

  it('rejects empty, malformed, and oversized payloads without telemetry', async () => {
    expect((await POST(post(''))).status).toBe(400)
    expect((await POST(post('{not-json'))).status).toBe(400)
    expect((await POST(post('{}', {
      'content-length': String(MAX_A2A_AGENT_CARD_BYTES + 1),
    }))).status).toBe(413)
    expect(captureEvent).not.toHaveBeenCalled()
  })

  it('accepts raw and wrapped v1 cards and returns only a bounded report', async () => {
    const rawResponse = await POST(post(JSON.stringify(validCard), {
      'content-type': 'application/a2a+json; charset=utf-8',
    }))
    expect(rawResponse.status).toBe(200)
    const rawJson = await rawResponse.json()
    expect(rawJson).toMatchObject({
      ok: true,
      profile: 'a2a-1.0',
      specRelease: A2A_AGENT_CARD_SPEC_RELEASE,
      valid: true,
      compatible: true,
      preferredInterface: {
        url: 'https://agents.example.com/a2a',
        protocolBinding: 'JSONRPC',
        protocolVersion: '1.0',
      },
      selectedInterface: {
        url: 'https://agents.example.com/a2a',
        protocolBinding: 'JSONRPC',
        protocolVersion: '1.0',
      },
      skillCount: 1,
      compatibleSkillCount: 1,
    })
    expect(JSON.stringify(rawJson)).not.toContain('X-Agent-Key')
    expect(JSON.stringify(rawJson)).not.toContain('Secret header supplied by the peer')

    const wrappedResponse = await POST(post(JSON.stringify({ card: validCard })))
    expect(wrappedResponse.status).toBe(200)
    expect(captureEvent).toHaveBeenCalledTimes(2)
    expect(captureEvent).toHaveBeenLastCalledWith(
      'a2a.agent_card.validate',
      expect.objectContaining({
        profile: 'a2a-1.0',
        specRelease: A2A_AGENT_CARD_SPEC_RELEASE,
        valid: true,
        compatible: true,
        interfaceCount: 1,
        protocolVersions: '1.0',
        skillCount: 1,
        authenticated: true,
        streaming: true,
      }),
    )
  })

  it('returns 200 for a structurally valid card that Nexez cannot use', async () => {
    const response = await POST(post(JSON.stringify({
      ...validCard,
      supportedInterfaces: [{
        url: 'https://agents.example.com/a2a',
        protocolBinding: 'GRPC',
        protocolVersion: '1.0',
      }],
    })))

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.valid).toBe(true)
    expect(json.compatible).toBe(false)
    expect(json.preferredInterface).toMatchObject({ protocolBinding: 'GRPC' })
    expect(json.selectedInterface).toBeNull()
  })

  it('returns a machine-readable 422 report for legacy or unsafe cards', async () => {
    const response = await POST(post(JSON.stringify({
      ...validCard,
      protocolVersion: '0.3.0',
      url: 'http://192.168.1.9/a2a',
      supportedInterfaces: [{
        url: 'http://192.168.1.9/a2a',
        protocolBinding: 'JSONRPC',
        protocolVersion: '1.0',
      }],
      capabilities: { streaming: 'sometimes' },
    })))

    expect(response.status).toBe(422)
    const json = await response.json()
    expect(json.ok).toBe(true)
    expect(json.valid).toBe(false)
    expect(json.compatible).toBe(false)
    expect(json.issues.map((issue: { code: string }) => issue.code)).toEqual(expect.arrayContaining([
      'legacy_field',
      'private_endpoint',
      'insecure_endpoint',
      'invalid_boolean',
    ]))
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('measures actual UTF-8 bytes when content-length is absent or untrusted', async () => {
    const oversized = JSON.stringify({ card: `é${'x'.repeat(MAX_A2A_AGENT_CARD_BYTES)}` })
    const response = await POST(post(oversized))

    expect(response.status).toBe(413)
    expect(captureEvent).not.toHaveBeenCalled()
  })
})
