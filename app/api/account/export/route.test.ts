import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../../../test/supabase-mock'

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('../../../../utils/supabase/server', () => ({ createClient: vi.fn() }))

import { GET } from './route'
import { createClient } from '../../../../utils/supabase/server'

describe('GET /api/account/export', () => {
  beforeEach(() => vi.clearAllMocks())

  it('401 when not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue(createSupabaseMock(() => ({ data: [] }), { user: null }) as any)
    expect((await GET()).status).toBe(401)
  })

  it('returns the caller’s data as a JSON download, scoped to their owner_id', async () => {
    const ownerScoped: string[] = []
    vi.mocked(createClient).mockReturnValue(
      createSupabaseMock(
        (ctx) => {
          if (ctx.eqs.owner_id) ownerScoped.push(ctx.eqs.owner_id)
          return { data: [] }
        },
        { user: { id: 'owner-X', email: 'me@acme.com', created_at: '2026-01-01', user_metadata: {} } },
      ) as any,
    )
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toContain('nexez-export-owner-X.json')
    const body = await res.json()
    expect(body.account.id).toBe('owner-X')
    // every table query was filtered to the caller's id (tenancy)
    expect(ownerScoped.every((o) => o === 'owner-X')).toBe(true)
    // secrets must never be exported
    expect(JSON.stringify(body)).not.toMatch(/key_hash|webhook_secret/i)
  })
})
