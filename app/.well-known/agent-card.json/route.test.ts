import { describe, expect, it } from 'vitest'
import {
  A2A_ENDPOINT_PATH,
  A2A_PROTOCOL_VERSION,
  A2A_STREAMING_DEPLOYED,
  A2A_TRANSPORT_DEPLOYED,
} from '../../../lib/a2a/discovery'
import { agentRuntimeUrl } from '../../../lib/site'
import { GET } from './route'

describe('GET /.well-known/agent-card.json', () => {
  it('publishes the deployed A2A v1 transport and exact streaming capability', async () => {
    expect(A2A_TRANSPORT_DEPLOYED).toBe(true)
    expect(A2A_STREAMING_DEPLOYED).toBe(true)

    const response = await GET()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('s-maxage=600')
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('x-robots-tag')).toBe('noindex')
    await expect(response.json()).resolves.toMatchObject({
      supportedInterfaces: [{
        url: agentRuntimeUrl(A2A_ENDPOINT_PATH),
        protocolBinding: 'JSONRPC',
        protocolVersion: A2A_PROTOCOL_VERSION,
      }],
      capabilities: {
        streaming: true,
        pushNotifications: false,
        extendedAgentCard: false,
      },
    })
  })
})
