import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock } from '../../../../test/supabase-mock'

const refs = vi.hoisted(() => ({
  user: { id: 'owner-1' } as { id: string } | null,
  current: { slug: 'current-listing' } as Record<string, string> | null,
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({})) }))
vi.mock('../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('../../../../utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('../../../../lib/server/public-identifier', () => ({
  getPublicIdentifierAvailability: vi.fn(async ({ identifier }: { identifier: string }) => ({
    available: identifier !== 'taken-name',
    reason: identifier === 'taken-name' ? 'taken' : 'available',
  })),
}))

import { createClient } from '../../../../utils/supabase/server'
import { GET } from './route'

function wire() {
  vi.mocked(createClient).mockReturnValue(
    createSupabaseMock(() => ({ data: refs.current, error: null }), { user: refs.user }) as never,
  )
}

function request(params: Record<string, string>) {
  return new Request(`https://app.nexez.ai/api/public-identifiers/availability?${new URLSearchParams(params)}`)
}

describe('GET /api/public-identifiers/availability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.user = { id: 'owner-1' }
    refs.current = { slug: 'current-listing' }
    wire()
  })

  it('requires an authenticated merchant', async () => {
    refs.user = null
    wire()
    expect((await GET(request({ namespace: 'page_slug', value: 'fresh-name' }))).status).toBe(401)
  })

  it('returns readable local policy failures without exposing claim data', async () => {
    const short = await GET(request({ namespace: 'page_slug', value: 'abcd' }))
    expect(short.status).toBe(200)
    expect(await short.json()).toMatchObject({ available: false, reason: 'too_short' })

    const reserved = await GET(request({ namespace: 'storefront_handle', value: 'checkout' }))
    expect(await reserved.json()).toMatchObject({ available: false, reason: 'reserved' })
  })

  it('reports authoritative availability and checked suggestions', async () => {
    const available = await GET(request({ namespace: 'page_slug', value: 'fresh-name' }))
    expect(await available.json()).toMatchObject({ available: true, reason: 'available', message: 'Available' })

    const taken = await GET(request({ namespace: 'page_slug', value: 'taken-name' }))
    const body = await taken.json()
    expect(body).toMatchObject({ available: false, reason: 'taken' })
    expect(body.suggestions.length).toBeGreaterThan(0)
  })

  it('verifies the subject belongs to the signed-in merchant', async () => {
    refs.current = null
    wire()
    const response = await GET(request({
      namespace: 'page_slug',
      value: 'current-listing',
      subjectId: 'other-page',
    }))
    expect(response.status).toBe(404)
  })
})
