import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../../../test/supabase-mock'

vi.mock('../../../../utils/supabase/admin', () => ({ createAdminClient: vi.fn(), hasSupabaseAdminEnv: vi.fn() }))

import { POST } from './route'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

const post = (opts: { slug?: string; headers?: Record<string, string> } = {}) => {
  const u = new URL('https://nexez.test/api/webhooks/calendly')
  if (opts.slug) u.searchParams.set('slug', opts.slug)
  return new Request(u, { method: 'POST', headers: opts.headers || {}, body: '{}' }) as any
}

describe('POST /api/webhooks/calendly', () => {
  beforeEach(() => vi.clearAllMocks())

  it('412 when the service role is not configured', async () => {
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(false)
    expect((await POST(post({ slug: 'demo' }))).status).toBe(412)
  })

  it('400 when no page slug is provided', async () => {
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
    vi.mocked(createAdminClient).mockReturnValue(createSupabaseMock(() => ({ data: [] })) as any)
    expect((await POST(post())).status).toBe(400)
  })

  it('404 when no page matches the slug', async () => {
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
    vi.mocked(createAdminClient).mockReturnValue(createSupabaseMock(() => ({ data: [] })) as any)
    expect((await POST(post({ slug: 'missing' }))).status).toBe(404)
  })
})
