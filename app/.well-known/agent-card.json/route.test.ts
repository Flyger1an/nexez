import { describe, expect, it } from 'vitest'
import { A2A_TRANSPORT_DEPLOYED } from '../../../lib/a2a/discovery'
import { GET } from './route'

describe('GET /.well-known/agent-card.json', () => {
  it('fails closed while no A2A transport is deployed', async () => {
    expect(A2A_TRANSPORT_DEPLOYED).toBe(false)

    const response = await GET()

    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('x-robots-tag')).toBe('noindex')
    expect(await response.text()).toBe('')
  })
})
