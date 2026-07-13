import { describe, it, expect } from 'vitest'
import { GET } from './route'

describe('GET /.well-known/nexez.json', () => {
  it('serves the capabilities doc cached + noindexed (agents still fetch it; Google never indexes it)', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('public')
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
    const body = await res.json()
    expect(JSON.stringify(body)).toContain('nexez')
  })
})
