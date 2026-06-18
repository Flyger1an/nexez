import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const { authRef, registerRef, rateLimitRef } = vi.hoisted(() => ({
  authRef: { result: null as any },
  registerRef: { handler: vi.fn(async (_db: any, _input: any) => ({ ok: true }) as { ok: boolean; error?: string }) },
  rateLimitRef: { response: null as any },
}))

vi.mock('../../../../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => rateLimitRef.response),
}))
vi.mock('../../../../../lib/agents/nexie-auth', () => ({
  authenticateNexieRequest: vi.fn(async () => authRef.result),
}))
vi.mock('../../../../../lib/push', () => ({
  registerPushToken: (db: any, input: any) => registerRef.handler(db, input),
}))

import { POST } from './route'

const post = (body: unknown) =>
  new Request('https://nexez.test/api/agents/nexie/push-token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as any

beforeEach(() => {
  rateLimitRef.response = null
  registerRef.handler = vi.fn(async () => ({ ok: true }))
  authRef.result = { ok: true, user: { id: 'u1', email: 'B@x.com' }, db: {} }
})

describe('POST /api/agents/nexie/push-token', () => {
  it('passes through the rate-limit response when throttled', async () => {
    rateLimitRef.response = NextResponse.json({ error: 'rate' }, { status: 429 })
    expect((await POST(post({ token: 't' }))).status).toBe(429)
  })

  it('401s when unauthenticated', async () => {
    authRef.result = { ok: false, response: NextResponse.json({ code: 'auth_required' }, { status: 401 }) }
    expect((await POST(post({ token: 't' }))).status).toBe(401)
  })

  it('400s (and skips the upsert) when the token is missing', async () => {
    const res = await POST(post({}))
    expect(res.status).toBe(400)
    expect(registerRef.handler).not.toHaveBeenCalled()
  })

  it('registers the token with the authenticated user id + email + platform', async () => {
    const res = await POST(post({ token: 'ExponentPushToken[abc]', platform: 'ios', deviceName: 'iPhone' }))
    expect(await res.json()).toEqual({ ok: true })
    expect(registerRef.handler).toHaveBeenCalledTimes(1)
    const [, input] = registerRef.handler.mock.calls[0]
    expect(input).toMatchObject({
      userId: 'u1',
      email: 'B@x.com',
      token: 'ExponentPushToken[abc]',
      platform: 'ios',
      deviceName: 'iPhone',
    })
  })

  it('falls back to platform "unknown" for an unrecognized platform', async () => {
    await POST(post({ token: 't', platform: 'windows' }))
    const [, input] = registerRef.handler.mock.calls[0]
    expect(input.platform).toBe('unknown')
  })

  it('500s when the upsert fails', async () => {
    registerRef.handler = vi.fn(async () => ({ ok: false, error: 'db down' }))
    expect((await POST(post({ token: 't' }))).status).toBe(500)
  })
})
