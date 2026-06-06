import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../../utils/supabase/admin', () => ({ hasSupabaseAdminEnv: vi.fn() }))

import { GET } from './route'
import { hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

describe('GET /api/v1/health', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reports configured:true when the service role is present (no secret leaked)', async () => {
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, service: 'nexez-api-v1', configured: true })
    expect(JSON.stringify(body)).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE_KEY=/i)
  })

  it('reports configured:false when unconfigured', async () => {
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(false)
    const body = await (await GET()).json()
    expect(body.configured).toBe(false)
  })
})
