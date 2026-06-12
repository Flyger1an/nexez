import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('../../../utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('../../../lib/llm', () => ({ isLlmConfigured: () => false, llmComplete: vi.fn() }))

import { POST } from './route'
import { createClient } from '../../../utils/supabase/server'
import { createSupabaseMock } from '../../../test/supabase-mock'

const post = (body: unknown) =>
  new Request('https://nexez.test/api/trust-report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/trust-report (auth gate)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('401 when not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue(createSupabaseMock(() => ({ data: null }), { user: null }) as any)
    const res = await POST(post({ page: { name: 'x', description: 'x' }, events: [] }))
    expect(res.status).toBe(401)
  })

  it('serves an authenticated owner (deterministic when LLM unconfigured)', async () => {
    vi.mocked(createClient).mockReturnValue(createSupabaseMock(() => ({ data: null }), { user: { id: 'u1' } }) as any)
    const res = await POST(post({ page: { name: 'x', description: 'x' }, events: [] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.llmEnhanced).toBe(false)
  })
})
