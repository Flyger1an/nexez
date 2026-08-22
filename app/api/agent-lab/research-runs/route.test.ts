import { beforeEach, describe, expect, it, vi } from 'vitest'

const { state } = vi.hoisted(() => ({
  state: {
    user: { id: 'owner-1' } as { id: string } | null,
    rows: [] as any[],
    error: null as any,
    calls: [] as Array<{ op: string; eqs: Record<string, unknown>; limit?: number }>,
    deleted: { id: '123e4567-e89b-42d3-a456-426614174000' } as { id: string } | null,
  },
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: state.user } })) },
    from: vi.fn(() => {
      const call = { op: 'select', eqs: {} as Record<string, unknown>, limit: undefined as number | undefined }
      state.calls.push(call)
      const chain: any = {
        select: vi.fn(() => chain),
        delete: vi.fn(() => { call.op = 'delete'; return chain }),
        eq: vi.fn((key: string, value: unknown) => { call.eqs[key] = value; return chain }),
        order: vi.fn(() => chain),
        limit: vi.fn((value: number) => { call.limit = value; return chain }),
        returns: vi.fn(async () => ({ data: state.rows, error: state.error })),
        maybeSingle: vi.fn(async () => ({ data: state.deleted, error: state.error })),
      }
      return chain
    }),
  })),
}))

import { DELETE, GET } from './route'

describe('/api/agent-lab/research-runs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.user = { id: 'owner-1' }
    state.rows = []
    state.error = null
    state.calls = []
    state.deleted = { id: '123e4567-e89b-42d3-a456-426614174000' }
  })

  it('requires authentication for history', async () => {
    state.user = null
    expect((await GET(new Request('https://nexez.test/api/agent-lab/research-runs'))).status).toBe(401)
  })

  it('rejects unknown research kinds before querying', async () => {
    const response = await GET(new Request('https://nexez.test/api/agent-lab/research-runs?kind=private_html'))
    expect(response.status).toBe(400)
    expect(state.calls).toEqual([])
  })

  it('loads only the current owner and clamps the requested limit', async () => {
    const response = await GET(new Request('https://nexez.test/api/agent-lab/research-runs?kind=url_snapshot&limit=9999'))
    expect(response.status).toBe(200)
    expect(state.calls[0]).toMatchObject({ eqs: { owner_id: 'owner-1', kind: 'url_snapshot' }, limit: 100 })
  })

  it('rejects malformed delete ids', async () => {
    const response = await DELETE(new Request('https://nexez.test/api/agent-lab/research-runs', {
      method: 'DELETE', body: JSON.stringify({ id: 'not-an-id' }),
    }))
    expect(response.status).toBe(400)
    expect(state.calls).toEqual([])
  })

  it('deletes through an owner-scoped query', async () => {
    const id = '123e4567-e89b-42d3-a456-426614174000'
    const response = await DELETE(new Request('https://nexez.test/api/agent-lab/research-runs', {
      method: 'DELETE', body: JSON.stringify({ id }),
    }))
    expect(response.status).toBe(200)
    expect(state.calls[0]).toMatchObject({ op: 'delete', eqs: { id, owner_id: 'owner-1' } })
  })

  it('does not reveal whether another owner has a requested id', async () => {
    state.deleted = null
    const response = await DELETE(new Request('https://nexez.test/api/agent-lab/research-runs', {
      method: 'DELETE', body: JSON.stringify({ id: '123e4567-e89b-42d3-a456-426614174000' }),
    }))
    expect(response.status).toBe(404)
  })
})
