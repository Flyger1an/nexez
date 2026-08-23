import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../../test/supabase-mock'

const REQUEST_ID = '1839d290-1f83-4ee2-9b9e-58c79429e866'

const refs = vi.hoisted(() => ({
  auth: { user: { id: 'owner-1' } as { id: string } | null, request: { id: '1839d290-1f83-4ee2-9b9e-58c79429e866' } as { id: string } | null },
  admin: { handler: (_context: QueryContext) => ({ data: null, error: null }) as { data?: unknown; error?: unknown } },
}))

vi.mock('../../../../lib/server/request-auth', async () => {
  const { createSupabaseMock } = await import('../../../../test/supabase-mock')
  return {
    resolveRequestAuth: vi.fn(async () => ({
      user: refs.auth.user,
      supabase: createSupabaseMock((context) => context.table === 'order_requests'
        ? { data: refs.auth.request, error: null }
        : { data: null, error: null }),
    })),
  }
})

vi.mock('../../../../utils/supabase/admin', async () => {
  const { createSupabaseMock } = await import('../../../../test/supabase-mock')
  return {
    hasSupabaseAdminEnv: vi.fn(() => true),
    createAdminClient: vi.fn(() => createSupabaseMock((context) => refs.admin.handler(context))),
  }
})

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
    refs.admin.handler = (context) => context.table === 'order_requests' && context.op === 'update'
      ? { data: { id: REQUEST_ID }, error: null }
      : { data: null, error: null }
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
})
