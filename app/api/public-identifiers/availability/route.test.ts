import { beforeEach, describe, expect, it, vi } from 'vitest'

const refs = vi.hoisted(() => ({
  user: { id: 'owner-1' } as { id: string } | null,
  current: { slug: 'current-listing' } as Record<string, string> | null,
  ownershipError: null as { message: string } | null,
  limited: null as Response | null,
}))

vi.mock('../../../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => refs.limited),
}))
vi.mock('../../../../lib/server/request-auth', async () => {
  const { createSupabaseMock } = await import('../../../../test/supabase-mock')
  return {
    resolveRequestAuth: vi.fn(async () => ({
      user: refs.user,
      supabase: createSupabaseMock(() => ({ data: refs.current, error: refs.ownershipError })),
    })),
  }
})
vi.mock('../../../../lib/server/public-identifier', () => ({
  getPublicIdentifierAvailability: vi.fn(async ({ identifier }: { identifier: string }) => ({
    available: identifier !== 'taken-name',
    reason: identifier === 'taken-name' ? 'taken' : 'available',
  })),
}))

import { enforceRateLimit } from '../../../../lib/rate-limit'
import { resolveRequestAuth } from '../../../../lib/server/request-auth'
import { getPublicIdentifierAvailability } from '../../../../lib/server/public-identifier'
import { GET } from './route'

function request(params: Record<string, string>) {
  return new Request(`https://app.nexez.ai/api/public-identifiers/availability?${new URLSearchParams(params)}`)
}

describe('GET /api/public-identifiers/availability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.user = { id: 'owner-1' }
    refs.current = { slug: 'current-listing' }
    refs.ownershipError = null
    refs.limited = null
  })

  it('passes the request to the shared bearer-or-cookie auth resolver', async () => {
    const incoming = request({ namespace: 'page_slug', value: 'fresh-name' })
    expect((await GET(incoming)).status).toBe(200)
    expect(resolveRequestAuth).toHaveBeenCalledWith(incoming)
  })

  it('requires an authenticated merchant without querying availability', async () => {
    refs.user = null
    expect((await GET(request({ namespace: 'page_slug', value: 'fresh-name' }))).status).toBe(401)
    expect(getPublicIdentifierAvailability).not.toHaveBeenCalled()
  })

  it('rate limits by verified user before parsing or querying', async () => {
    refs.limited = Response.json({ error: 'Too many requests' }, { status: 429 })
    expect((await GET(request({ namespace: 'unknown', value: 'fresh-name' }))).status).toBe(429)
    expect(enforceRateLimit).toHaveBeenCalledWith(
      expect.any(Request),
      'public-identifier-availability',
      60,
      60_000,
      { subject: 'owner-1' },
    )
    expect(getPublicIdentifierAvailability).not.toHaveBeenCalled()
  })

  it('rejects unknown namespaces without querying availability', async () => {
    expect((await GET(request({ namespace: 'unknown', value: 'fresh-name' }))).status).toBe(400)
    expect(getPublicIdentifierAvailability).not.toHaveBeenCalled()
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
    const response = await GET(request({
      namespace: 'page_slug',
      value: 'current-listing',
      subjectId: 'other-page',
    }))
    expect(response.status).toBe(404)
    expect(getPublicIdentifierAvailability).not.toHaveBeenCalled()
  })

  it('uses the owned current value to preserve a grandfathered public name', async () => {
    refs.current = { slug: 'old' }
    const response = await GET(request({
      namespace: 'page_slug',
      value: 'old',
      subjectId: 'page-1',
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      value: 'old',
      available: true,
      grandfathered: true,
    })
  })

  it('does not expose ownership storage errors or claim data', async () => {
    refs.ownershipError = { message: 'secret database detail' }
    const response = await GET(request({
      namespace: 'page_slug',
      value: 'current-listing',
      subjectId: 'page-1',
    }))
    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain('secret database detail')
    expect(getPublicIdentifierAvailability).not.toHaveBeenCalled()
  })

  it('returns a generic service response when the authoritative check fails', async () => {
    vi.mocked(getPublicIdentifierAvailability).mockRejectedValueOnce(new Error('secret rpc detail'))
    const response = await GET(request({ namespace: 'page_slug', value: 'fresh-name' }))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Public name availability is temporarily unavailable.' })
  })
})
