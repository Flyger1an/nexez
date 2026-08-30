import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../../test/supabase-mock'

const REQUEST_ID = '1839d290-1f83-4ee2-9b9e-58c79429e866'

const refs = vi.hoisted(() => ({
  auth: {
    user: { id: 'owner-1' } as { id: string } | null,
    request: { id: '1839d290-1f83-4ee2-9b9e-58c79429e866' } as { id: string } | null,
    error: null as { message: string } | null,
  },
  admin: { handler: (_context: QueryContext) => ({ data: null, error: null }) as { data?: unknown; error?: unknown } },
  adminEnabled: true,
  limited: null as Response | null,
}))

vi.mock('../../../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => refs.limited),
}))

vi.mock('../../../../lib/server/request-auth', async () => {
  const { createSupabaseMock } = await import('../../../../test/supabase-mock')
  return {
    resolveRequestAuth: vi.fn(async () => ({
      user: refs.auth.user,
      supabase: createSupabaseMock((context) => context.table === 'order_requests'
        ? { data: refs.auth.request, error: refs.auth.error }
        : { data: null, error: null }),
    })),
  }
})

vi.mock('../../../../utils/supabase/admin', async () => {
  const { createSupabaseMock } = await import('../../../../test/supabase-mock')
  return {
    hasSupabaseAdminEnv: vi.fn(() => refs.adminEnabled),
    createAdminClient: vi.fn(() => createSupabaseMock((context) => refs.admin.handler(context))),
  }
})

import { resolveRequestAuth } from '../../../../lib/server/request-auth'
import { POST } from './route'

function request(status: string) {
  return new Request('https://nexez.test/api/orders/request-status', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: REQUEST_ID, status }),
  })
}

describe('POST /api/orders/request-status', () => {
  beforeEach(() => {
    refs.auth.user = { id: 'owner-1' }
    refs.auth.request = { id: REQUEST_ID }
    refs.auth.error = null
    refs.adminEnabled = true
    refs.limited = null
    refs.admin.handler = (context) => context.table === 'order_requests' && context.op === 'update'
      ? { data: { id: REQUEST_ID }, error: null }
      : { data: null, error: null }
  })

  it('short-circuits rate-limited requests before authentication', async () => {
    refs.limited = Response.json({ error: 'Too many requests' }, { status: 429 })
    expect((await POST(request('resolved'))).status).toBe(429)
    expect(resolveRequestAuth).not.toHaveBeenCalled()
  })

  it('passes the exact request to the shared bearer-or-cookie auth resolver', async () => {
    const incoming = request('resolved')
    expect((await POST(incoming)).status).toBe(200)
    expect(resolveRequestAuth).toHaveBeenCalledWith(incoming)
  })

  it('requires authentication and an allowed status', async () => {
    refs.auth.user = null
    expect((await POST(request('resolved'))).status).toBe(401)
    refs.auth.user = { id: 'owner-1' }
    expect((await POST(request('open'))).status).toBe(400)
  })

  it('rejects malformed request ids before querying storage', async () => {
    const malformed = new Request('https://nexez.test/api/orders/request-status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'not-a-uuid', status: 'resolved' }),
    })
    expect((await POST(malformed)).status).toBe(400)
  })

  it('does not expose a foreign request', async () => {
    refs.auth.request = null
    expect((await POST(request('resolved'))).status).toBe(404)
  })

  it('fails generically when ownership cannot be verified', async () => {
    refs.auth.error = { message: 'secret storage detail' }
    const response = await POST(request('resolved'))
    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain('secret storage detail')
  })

  it('fails closed when server-side order operations are unavailable', async () => {
    refs.adminEnabled = false
    expect((await POST(request('resolved'))).status).toBe(503)
  })

  it('writes through the server client only after the owner check', async () => {
    const updates: QueryContext[] = []
    refs.admin.handler = (context) => {
      if (context.op === 'update') updates.push(context)
      return { data: { id: REQUEST_ID }, error: null }
    }
    const response = await POST(request('acknowledged'))
    expect(response.status).toBe(200)
    expect(updates[0]?.payload).toEqual({ status: 'acknowledged' })
    expect(updates[0]?.eqs).toMatchObject({ id: REQUEST_ID, owner_id: 'owner-1' })
  })

  it('returns generic failures for an unsuccessful or missing server write', async () => {
    refs.admin.handler = () => ({ data: null, error: { message: 'secret admin detail' } })
    const failed = await POST(request('resolved'))
    expect(failed.status).toBe(500)
    expect(JSON.stringify(await failed.json())).not.toContain('secret admin detail')

    refs.admin.handler = () => ({ data: null, error: null })
    expect((await POST(request('resolved'))).status).toBe(404)
  })
})
