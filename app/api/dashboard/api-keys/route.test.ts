import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../../../test/supabase-mock'

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('../../../../utils/supabase/server', () => ({ createClient: vi.fn() }))

import { POST } from './route'
import { createClient } from '../../../../utils/supabase/server'

const req = (body?: unknown) =>
  new Request('https://nexez.test/api/dashboard/api-keys', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })

describe('POST /api/dashboard/api-keys', () => {
  beforeEach(() => vi.clearAllMocks())

  it('401 when not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue(createSupabaseMock(() => ({ data: null }), { user: null }) as any)
    expect((await POST(req({ name: 'x' }))).status).toBe(401)
  })

  it('mints a key for the caller, stores only the hash, and returns the raw key exactly once', async () => {
    let insert: any
    vi.mocked(createClient).mockReturnValue(
      createSupabaseMock(
        (c) => {
          if (c.table === 'billing_subscriptions') return { data: { plan_id: 'pro', status: 'active' } }
          if (c.op === 'insert') {
            insert = c.payload
            return { data: { id: 'k1', name: c.payload.name, prefix: c.payload.prefix, created_at: 't' } }
          }
          return { data: null }
        },
        { user: { id: 'owner-A' } },
      ) as any,
    )
    const res = await POST(req({ name: 'CI key' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.raw).toBeTruthy() // raw returned once
    expect(insert.owner_id).toBe('owner-A') // tenancy: key bound to the caller
    expect(insert.key_hash).toBeTruthy()
    expect(insert.key_hash).not.toBe(body.raw) // only the hash is persisted
    expect(insert).not.toHaveProperty('raw')
  })
})
