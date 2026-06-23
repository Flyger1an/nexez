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
vi.mock('../../../../../lib/agents/nexie-auth', () => ({ authenticateNexieRequest: vi.fn(async () => authRef.result) }))

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
  new Request('https://nexez.test/api/agents/nexie/saved', {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }) as any

beforeEach(() => {
  rateRef.response = null
  authRef.result = { ok: true, user: { id: 'u1', email: 'b@x.com' }, db }
  dbRef.list = { data: [{ slug: 'demo', created_at: '2026-06-18T00:00:00Z' }], error: null }
  dbRef.insert = { error: null }
  dbRef.del = { error: null }
  dbRef.inserted = []
})

describe('saved endpoint', () => {
  it('401s when unauthenticated', async () => {
    authRef.result = { ok: false, response: NextResponse.json({ code: 'auth_required' }, { status: 401 }) }
    expect((await GET(req())).status).toBe(401)
  })

  it('GET returns the buyer saved slugs (newest first)', async () => {
    const res = await GET(req())
    expect(await res.json()).toEqual({ ok: true, saved: [{ slug: 'demo', createdAt: '2026-06-18T00:00:00Z' }] })
  })

  it('POST saves a valid slug for the session user', async () => {
    const res = await POST(req('POST', { slug: 'Acme-Plumbing' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, saved: true })
    expect(dbRef.inserted).toEqual([{ user_id: 'u1', slug: 'acme-plumbing' }]) // lowercased, owner from session
  })

  it('POST is idempotent (duplicate save → still ok)', async () => {
    dbRef.insert = { error: { code: '23505', message: 'duplicate' } }
    expect((await POST(req('POST', { slug: 'demo' }))).status).toBe(200)
  })

  it('POST 400s on an invalid slug', async () => {
    expect((await POST(req('POST', { slug: 'bad slug!' }))).status).toBe(400)
    expect((await POST(req('POST', {}))).status).toBe(400)
  })

  it('DELETE unsaves a valid slug', async () => {
    const res = await DELETE(req('DELETE', { slug: 'demo' }))
    expect(await res.json()).toEqual({ ok: true, saved: false })
  })

  it('DELETE 400s on an invalid slug', async () => {
    expect((await DELETE(req('DELETE', { slug: '' }))).status).toBe(400)
  })
})
