import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn() }))

import { POST } from './route'
import { createClient } from '@/utils/supabase/server'
import { createSupabaseMock } from '../../../test/supabase-mock'

const post = (body: unknown) =>
  new Request('https://nexez.test/api/analyze-competitor', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/analyze-competitor (auth gate)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('401 when not authenticated — never reaches outbound scraping', async () => {
    vi.mocked(createClient).mockReturnValue(createSupabaseMock(() => ({ data: null }), { user: null }) as any)
    const res = await POST(post({ url: 'https://example.com' }))
    expect(res.status).toBe(401)
  })
})
