import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const { authRef, rateRef, dbRef } = vi.hoisted(() => ({
  authRef: { result: null as any },
  rateRef: { response: null as any },
  dbRef: {
    list: { data: [] as any[], error: null as any },
    count: 0,
    insert: { error: null as any },
    update: { error: null as any },
    del: { error: null as any },
    inserted: [] as any[],
    updated: [] as any[],
  },
}))

vi.mock('../../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => rateRef.response) }))
vi.mock('../../../../../lib/agents/nexxi-auth', () => ({ authenticateNexxiRequest: vi.fn(async () => authRef.result) }))

import { GET, POST, PATCH, DELETE } from './route'

const db = {
  from: () => ({
    // list (GET) → select().order().returns(); count (POST) → select(..,{head}).eq() → {count}
    select: (_cols?: any, opts?: any) =>
      opts?.head
        ? { eq: () => Promise.resolve({ count: dbRef.count, error: null }) }
        : { order: () => ({ returns: () => Promise.resolve(dbRef.list) }) },
    insert: (row: any) => {
      dbRef.inserted.push(row)
      return Promise.resolve(dbRef.insert)
    },
    update: (patch: any) => {
      dbRef.updated.push(patch)
      return { eq: () => Promise.resolve(dbRef.update) }
    },
    delete: () => ({ eq: () => Promise.resolve(dbRef.del) }),
  }),
}

const req = (method = 'GET', body?: unknown) =>
  new Request('https://nexez.test/api/agents/nexxi/tasks', {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }) as any

const UUID = '11111111-2222-3333-4444-555555555555'

beforeEach(() => {
  rateRef.response = null
  authRef.result = { ok: true, user: { id: 'u1', email: 'b@x.com' }, db }
  dbRef.list = {
    data: [{ id: 'id1', prompt: 'plumber under 300', query: 'plumber', category: '', status: 'active', created_at: '2026-06-21T00:00:00Z' }],
    error: null,
  }
  dbRef.count = 0
  dbRef.insert = { error: null }
  dbRef.update = { error: null }
  dbRef.del = { error: null }
  dbRef.inserted = []
  dbRef.updated = []
})

describe('agent-tasks endpoint', () => {
  it('401s when unauthenticated', async () => {
    authRef.result = { ok: false, response: NextResponse.json({ code: 'auth_required' }, { status: 401 }) }
    expect((await GET(req())).status).toBe(401)
  })

  it('GET returns the buyer tasks', async () => {
    const res = await GET(req())
    expect(await res.json()).toEqual({
      ok: true,
      tasks: [{ id: 'id1', prompt: 'plumber under 300', query: 'plumber', category: '', status: 'active', createdAt: '2026-06-21T00:00:00Z' }],
    })
  })

  it('POST creates a task (prompt trimmed; query defaults to the prompt)', async () => {
    const res = await POST(req('POST', { prompt: '  find me a plumber  ' }))
    expect(res.status).toBe(200)
    expect(dbRef.inserted).toEqual([{ user_id: 'u1', prompt: 'find me a plumber', query: 'find me a plumber', category: '' }])
  })

  it('POST honors an explicit query + category', async () => {
    await POST(req('POST', { prompt: 'plumber under 300', query: 'plumber', category: 'Home services' }))
    expect(dbRef.inserted).toEqual([{ user_id: 'u1', prompt: 'plumber under 300', query: 'plumber', category: 'Home services' }])
  })

  it('POST 400s when the prompt is empty', async () => {
    expect((await POST(req('POST', { prompt: '   ' }))).status).toBe(400)
    expect((await POST(req('POST', {}))).status).toBe(400)
  })

  it('POST 409s at the active-task cap', async () => {
    dbRef.count = 20
    expect((await POST(req('POST', { prompt: 'one more' }))).status).toBe(409)
    expect(dbRef.inserted).toEqual([])
  })

  it('PATCH pauses/resumes (uuid + valid status required)', async () => {
    expect((await PATCH(req('PATCH', { id: 'nope', status: 'paused' }))).status).toBe(400)
    expect((await PATCH(req('PATCH', { id: UUID, status: 'sideways' }))).status).toBe(400)
    const res = await PATCH(req('PATCH', { id: UUID, status: 'paused' }))
    expect(res.status).toBe(200)
    expect(dbRef.updated).toEqual([{ status: 'paused' }])
  })

  it('DELETE removes by id (uuid required)', async () => {
    expect((await DELETE(req('DELETE', { id: 'not-a-uuid' }))).status).toBe(400)
    const res = await DELETE(req('DELETE', { id: UUID }))
    expect(await res.json()).toEqual({ ok: true })
  })
})
