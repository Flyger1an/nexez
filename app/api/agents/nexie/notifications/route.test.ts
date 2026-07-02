import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const { authRef, rateRef, dbRef } = vi.hoisted(() => ({
  authRef: { result: null as any },
  rateRef: { response: null as any },
  dbRef: { list: { data: [] as any, error: null as any }, update: { error: null as any } },
}))

vi.mock('../../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => rateRef.response) }))
vi.mock('../../../../../lib/agents/nexie-auth', () => ({ authenticateNexieRequest: vi.fn(async () => authRef.result) }))

import { GET, PATCH } from './route'

const db = {
  from: () => ({
    select: () => ({ order: () => ({ limit: () => ({ returns: () => Promise.resolve(dbRef.list) }) }) }),
    update: () => {
      const leaf = { eq: () => Promise.resolve(dbRef.update), then: (r: any) => r(dbRef.update) }
      return { is: () => leaf }
    },
  }),
}

const req = (method = 'GET', body?: unknown) =>
  new Request('https://nexez.test/api/agents/nexie/notifications', {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }) as any

const UUID = '11111111-2222-3333-4444-555555555555'

beforeEach(() => {
  rateRef.response = null
  authRef.result = { ok: true, user: { id: 'u1' }, db }
  dbRef.list = {
    data: [
      { id: 'n1', category: 'orders', type: 'order', title: 'Booking confirmed', body: 'b', data: { token: 't' }, read_at: null, created_at: '2026-06-30T00:00:00Z' },
      { id: 'n2', category: 'alerts', type: 'saved_search', title: 'New match', body: 'b', data: {}, read_at: '2026-06-29T00:00:00Z', created_at: '2026-06-28T00:00:00Z' },
    ],
    error: null,
  }
  dbRef.update = { error: null }
})

describe('notifications endpoint', () => {
  it('401s when unauthenticated', async () => {
    authRef.result = { ok: false, response: NextResponse.json({ code: 'auth_required' }, { status: 401 }) }
    expect((await GET(req())).status).toBe(401)
  })

  it('GET lists the feed newest-first with an unread count + read flag', async () => {
    const body = await (await GET(req())).json()
    expect(body.ok).toBe(true)
    expect(body.unreadCount).toBe(1)
    expect(body.notifications.map((n: any) => n.id)).toEqual(['n1', 'n2'])
    expect(body.notifications[0]).toMatchObject({ id: 'n1', category: 'orders', read: false })
    expect(body.notifications[1].read).toBe(true)
  })

  it('GET 500s on a db error', async () => {
    dbRef.list = { data: null, error: { message: 'boom' } }
    expect((await GET(req())).status).toBe(500)
  })

  it('PATCH { all: true } marks all unread read', async () => {
    expect((await PATCH(req('PATCH', { all: true }))).status).toBe(200)
  })

  it('PATCH { id } marks one read (uuid required)', async () => {
    expect((await PATCH(req('PATCH', { id: 'nope' }))).status).toBe(400)
    expect((await PATCH(req('PATCH', { id: UUID }))).status).toBe(200)
  })

  it('PATCH with neither id nor all 400s', async () => {
    expect((await PATCH(req('PATCH', {}))).status).toBe(400)
  })
})
