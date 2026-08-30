import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const { authRef, insertRef, rateLimitRef } = vi.hoisted(() => ({
  authRef: { result: null as any },
  insertRef: { error: null as any, row: null as any },
  rateLimitRef: { responses: [] as any[] },
}))

vi.mock('../../../../../lib/agents/nexie-auth', () => ({
  authenticateNexieRequest: vi.fn(async () => authRef.result),
}))
vi.mock('../../../../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => rateLimitRef.responses.shift() ?? null),
}))
vi.mock('../../../../../utils/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: vi.fn(async (row: unknown) => {
        insertRef.row = row
        return { error: insertRef.error }
      }),
    })),
  })),
}))

import { POST } from './route'

const valid = {
  clientEventId: '2ecea2a8-4507-4a36-bf75-42520489b2c0',
  eventName: 'app_opened',
  platform: 'ios',
  appVersion: '1.0.0',
  buildVersion: '12',
  runtimeVersion: '1.0.0',
  updateId: null,
  channel: 'beta',
}

function request(body: unknown = valid, headers: Record<string, string> = {}) {
  return new Request('https://nexez.test/api/agents/nexie/launch-events', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }) as any
}

beforeEach(() => {
  authRef.result = { ok: true, user: { id: 'user-1' }, db: {} }
  insertRef.error = null
  insertRef.row = null
  rateLimitRef.responses = []
})

describe('POST /api/agents/nexie/launch-events', () => {
  it('passes through IP and authenticated-user rate limits', async () => {
    rateLimitRef.responses = [NextResponse.json({ error: 'rate' }, { status: 429 })]
    expect((await POST(request())).status).toBe(429)

    rateLimitRef.responses = [null, NextResponse.json({ error: 'user rate' }, { status: 429 })]
    expect((await POST(request())).status).toBe(429)
  })

  it('requires authentication', async () => {
    authRef.result = { ok: false, response: NextResponse.json({ error: 'auth' }, { status: 401 }) }
    expect((await POST(request())).status).toBe(401)
  })

  it('rejects oversized, unknown, and context-bearing payloads', async () => {
    expect((await POST(request(valid, { 'content-length': '9000' }))).status).toBe(413)
    expect((await POST(request({ ...valid, eventName: 'made_up' }))).status).toBe(400)
    expect((await POST(request({ ...valid, message: 'must never be stored' }))).status).toBe(400)
  })

  it('requires an outcome only for checkout returns', async () => {
    expect((await POST(request({ ...valid, outcome: 'success' }))).status).toBe(400)
    expect((await POST(request({ ...valid, eventName: 'checkout_returned' }))).status).toBe(400)
    expect((await POST(request({ ...valid, eventName: 'checkout_returned', outcome: 'success' }))).status).toBe(202)
  })

  it('writes only normalized fields under the authenticated user', async () => {
    const response = await POST(request(valid))
    expect(response.status).toBe(202)
    expect(insertRef.row).toEqual({
      user_id: 'user-1',
      client_event_id: valid.clientEventId,
      event_name: 'app_opened',
      outcome: null,
      platform: 'ios',
      app_version: '1.0.0',
      build_version: '12',
      runtime_version: '1.0.0',
      update_id: null,
      channel: 'beta',
    })
  })

  it('treats a duplicate client event as an accepted replay', async () => {
    insertRef.error = { code: '23505', message: 'duplicate' }
    const response = await POST(request(valid))
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ ok: true, replayed: true })
  })

  it('fails closed when persistence fails', async () => {
    insertRef.error = { code: 'XX000', message: 'down' }
    expect((await POST(request(valid))).status).toBe(500)
  })
})
