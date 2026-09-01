import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const { authRef, rateRef, dbRef } = vi.hoisted(() => ({
  authRef: { result: null as any },
  rateRef: { response: null as any },
  dbRef: {
    list: { data: [] as any[], error: null as any },
    insert: { error: null as any },
    del: { error: null as any },
    inserted: [] as any[],
  },
}))

vi.mock('../../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => rateRef.response) }))
vi.mock('../../../../../lib/agents/nexxi-auth', () => ({ authenticateNexxiRequest: vi.fn(async () => authRef.result) }))

import { GET, POST, DELETE } from './route'

const db = {
  from: () => ({
    select: () => ({ order: () => ({ returns: () => Promise.resolve(dbRef.list) }) }),
    insert: (row: any) => {
      dbRef.inserted.push(row)
      return Promise.resolve(dbRef.insert)
    },
    delete: () => ({ eq: () => Promise.resolve(dbRef.del) }),
  }),
}

const req = (method = 'GET', body?: unknown) =>
  new Request('https://nexez.test/api/agents/nexxi/saved-searches', {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }) as any

beforeEach(() => {
  rateRef.response = null
  authRef.result = { ok: true, user: { id: 'u1', email: 'b@x.com' }, db }
  dbRef.list = { data: [{ id: 'id1', query: 'plumber', category: '', created_at: '2026-06-21T00:00:00Z' }], error: null }
  dbRef.insert = { error: null }
  dbRef.del = { error: null }
  dbRef.inserted = []
})

describe('saved-searches endpoint', () => {
  it('401s when unauthenticated', async () => {
    authRef.result = { ok: false, response: NextResponse.json({ code: 'auth_required' }, { status: 401 }) }
    expect((await GET(req())).status).toBe(401)
  })

  it('GET returns the buyer saved searches', async () => {
    const res = await GET(req())
    expect(await res.json()).toEqual({
      ok: true,
      searches: [{ id: 'id1', query: 'plumber', category: '', createdAt: '2026-06-21T00:00:00Z' }],
    })
  })

  it('POST saves a query (trimmed) for the session user', async () => {
    const res = await POST(req('POST', { query: '  deep tissue massage  ', category: 'Spa & wellness' }))
    expect(res.status).toBe(200)
    expect(dbRef.inserted).toEqual([{ user_id: 'u1', query: 'deep tissue massage', category: 'Spa & wellness' }])
  })

  it('POST 400s when both query and category are empty', async () => {
    expect((await POST(req('POST', { query: '   ', category: '' }))).status).toBe(400)
    expect((await POST(req('POST', {}))).status).toBe(400)
  })

  it('POST is idempotent (duplicate → still ok)', async () => {
    dbRef.insert = { error: { code: '23505', message: 'duplicate' } }
    expect((await POST(req('POST', { query: 'plumber' }))).status).toBe(200)
  })

  it('DELETE removes by id (uuid required)', async () => {
    expect((await DELETE(req('DELETE', { id: 'not-a-uuid' }))).status).toBe(400)
    const res = await DELETE(req('DELETE', { id: '11111111-2222-3333-4444-555555555555' }))
    expect(await res.json()).toEqual({ ok: true })
  })
})
