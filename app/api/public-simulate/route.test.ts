import { describe, it, expect } from 'vitest'
import { POST } from './route'

const post = (body: unknown) =>
  new Request('https://nexez.test/api/public-simulate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/public-simulate', () => {
  it('400 when the query is missing or blank', async () => {
    expect((await POST(post({}))).status).toBe(400)
    expect((await POST(post({ query: '   ' }))).status).toBe(400)
  })

  it('returns a query-aware interpretation for a real query', async () => {
    const res = await POST(post({ query: 'I need a consultation for my startup' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.intent).toBeTruthy()
    expect(Array.isArray(body.offers)).toBe(true)
    expect(Array.isArray(body.agentActions)).toBe(true)
    expect(body.schema).toBeTruthy()
  })
})
