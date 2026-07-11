import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../../utils/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({})), hasSupabaseAdminEnv: vi.fn(() => false) }))
vi.mock('../../../../lib/server/shopify-install', () => ({ markUninstalled: vi.fn() }))

import { POST } from './route'

const req = (headers: Record<string, string> = {}, body = '{}') =>
  new Request('https://nexez.app/api/webhooks/shopify', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  })

describe('POST /api/webhooks/shopify (inert until configured)', () => {
  beforeEach(() => vi.unstubAllEnvs())

  it('404 when Shopify is not configured (fail closed)', async () => {
    vi.stubEnv('SHOPIFY_API_KEY', '')
    vi.stubEnv('SHOPIFY_API_SECRET', '')
    expect((await POST(req())).status).toBe(404)
  })

  it('401 on a bad / absent HMAC when configured', async () => {
    vi.stubEnv('SHOPIFY_API_KEY', 'k')
    vi.stubEnv('SHOPIFY_API_SECRET', 's')
    expect((await POST(req({ 'x-shopify-hmac-sha256': 'bad' }))).status).toBe(401)
    expect((await POST(req())).status).toBe(401)
  })
})
