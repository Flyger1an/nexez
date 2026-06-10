import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../../../test/supabase-mock'

vi.mock('../../../../utils/supabase/admin', () => ({ createAdminClient: vi.fn(), hasSupabaseAdminEnv: vi.fn() }))

import { GET } from './route'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

const req = (params: Record<string, string>) =>
  new Request(`https://nexez.test/api/negotiations/status?${new URLSearchParams(params)}`)

describe('GET /api/negotiations/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
  })

  it('503 when the service role is not configured', async () => {
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(false)
    expect((await GET(req({ id: 'x', token: 'y' }))).status).toBe(503)
  })

  it('400 when id or token is missing', async () => {
    expect((await GET(req({ id: 'x' }))).status).toBe(400)
    expect((await GET(req({ token: 'y' }))).status).toBe(400)
  })

  it('constant 404 on id/token mismatch (no existence leak)', async () => {
    vi.mocked(createAdminClient).mockReturnValue(createSupabaseMock(() => ({ data: null })) as any)
    const res = await GET(req({ id: 'real-id', token: 'wrong-token' }))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('Negotiation not found.')
  })

  it('returns status + label + next step for a valid id/token pair, scoped by BOTH', async () => {
    let eqs: Record<string, any> = {}
    vi.mocked(createAdminClient).mockReturnValue(
      createSupabaseMock((ctx) => {
        eqs = ctx.eqs
        return { data: { id: 'n1', status: 'agreement_proposed', offer_name: 'Consult', updated_at: '2026-06-10T00:00:00Z' } }
      }) as any,
    )
    const res = await GET(req({ id: 'n1', token: 'tok123' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      id: 'n1',
      status: 'agreement_proposed',
      statusLabel: 'Agreement proposed',
      offer: 'Consult',
    })
    expect(body.next).toMatch(/agreement proposed/i)
    expect(eqs.id).toBe('n1')
    expect(eqs.status_token).toBe('tok123')
  })
})
