import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../../test/supabase-mock'

const refs = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  enforceRateLimit: vi.fn(),
  captureEvent: vi.fn(),
}))

vi.mock('../../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => true),
  createAdminClient: refs.createAdminClient,
}))
vi.mock('../../../../lib/rate-limit', () => ({ enforceRateLimit: refs.enforceRateLimit }))
vi.mock('../../../../lib/observability', () => ({ captureError: vi.fn(), captureEvent: refs.captureEvent }))

import { deriveScanOnboardingToken } from '../../../../lib/server/scan-lead-token'
import { POST } from './route'

const token = deriveScanOnboardingToken('lead-1')
const request = (value = token) => new Request('https://app.nexez.ai/api/scan/attribution', {
  method: 'POST',
  body: JSON.stringify({ token: value }),
})

describe('POST /api/scan/attribution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.enforceRateLimit.mockResolvedValue(null)
  })

  it('binds a valid lead without exposing its email address', async () => {
    const writes: QueryContext[] = []
    refs.createAdminClient.mockReturnValue(createSupabaseMock((ctx) => {
      if (ctx.op === 'select') return { data: { id: 'lead-1', domain: 'acme.example', score: 42, onboarding_opened_at: null }, error: null }
      writes.push({ ...ctx })
      return { data: null, error: null }
    }))

    const response = await POST(request())
    const body = await response.json()

    expect(body).toEqual({ ok: true, domain: 'acme.example', score: 42 })
    expect(response.headers.get('set-cookie')).toContain('nexez_scan_attribution=')
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
    expect(writes[0]?.payload.onboarding_opened_at).toBeTruthy()
    expect(refs.captureEvent).toHaveBeenCalledWith('scan.onboarding_opened', { host: 'acme.example', score: 42 })
  })

  it('rejects malformed and unknown tokens', async () => {
    expect((await POST(request('bad'))).status).toBe(400)
    refs.createAdminClient.mockReturnValue(createSupabaseMock(() => ({ data: null, error: null })))
    expect((await POST(request())).status).toBe(404)
  })
})
