import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const refs = vi.hoisted(() => ({
  user: { id: 'seller-1' } as { id: string } | null,
  rateLimitResponse: null as NextResponse | null,
  stored: null as null | Record<string, unknown>,
  loadError: null as null | { message: string },
  writeError: null as null | { message: string },
  upserted: null as null | Record<string, unknown>,
}))

vi.mock('../../../../lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => refs.rateLimitResponse),
}))

vi.mock('../../../../lib/server/request-auth', () => ({
  resolveRequestAuth: vi.fn(async () => ({ supabase: makeDb(), user: refs.user })),
}))

function makeDb() {
  return {
    from: vi.fn(() => {
      const query: Record<string, unknown> = {}
      query.select = vi.fn(() => query)
      query.eq = vi.fn(() => query)
      query.maybeSingle = vi.fn(async () => ({ data: refs.stored, error: refs.loadError }))
      query.upsert = vi.fn((row: Record<string, unknown>) => {
        refs.upserted = row
        return query
      })
      query.single = vi.fn(async () => ({ data: refs.stored, error: refs.writeError }))
      return query
    }),
  }
}

import { GET, PATCH } from './route'

const request = (method = 'GET', body?: string) => new Request('https://app.nexez.ai/api/seller/notification-preferences', {
  method,
  headers: method === 'PATCH' ? { 'content-type': 'application/json' } : undefined,
  body,
}) as any

beforeEach(() => {
  refs.user = { id: 'seller-1' }
  refs.rateLimitResponse = null
  refs.stored = null
  refs.loadError = null
  refs.writeError = null
  refs.upserted = null
})

describe('GET /api/seller/notification-preferences', () => {
  it('returns complete defaults without creating a row', async () => {
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      configured: false,
      preferences: {
        transactions: true,
        negotiations: true,
        integrations: true,
        reviews: true,
        marketing: true,
      },
    })
  })

  it('returns the stored optional choices while transactions remain required', async () => {
    refs.stored = {
      user_id: 'seller-1',
      negotiations_enabled: false,
      integrations_enabled: true,
      reviews_enabled: false,
      marketing_enabled: true,
    }
    const response = await GET(request())
    expect((await response.json()).preferences).toEqual({
      transactions: true,
      negotiations: false,
      integrations: true,
      reviews: false,
      marketing: true,
    })
  })

  it('honors rate limiting and authentication', async () => {
    refs.rateLimitResponse = NextResponse.json({ error: 'rate' }, { status: 429 })
    expect((await GET(request())).status).toBe(429)
    refs.rateLimitResponse = null
    refs.user = null
    expect((await GET(request())).status).toBe(401)
  })

  it('returns a bounded error when the owner-scoped read fails', async () => {
    refs.loadError = { message: 'database unavailable' }
    const response = await GET(request())
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Could not load notification preferences.' })
  })
})

describe('PATCH /api/seller/notification-preferences', () => {
  it('upserts only allowlisted mutable fields under the authenticated user id', async () => {
    refs.stored = {
      user_id: 'seller-1',
      negotiations_enabled: false,
      integrations_enabled: true,
      reviews_enabled: true,
      marketing_enabled: false,
    }
    const response = await PATCH(request('PATCH', JSON.stringify({
      preferences: { negotiations: false, marketing: false },
    })))

    expect(response.status).toBe(200)
    expect(refs.upserted).toEqual({
      user_id: 'seller-1',
      negotiations_enabled: false,
      marketing_enabled: false,
    })
    expect((await response.json()).preferences.transactions).toBe(true)
  })

  it('rejects malformed JSON, unexpected envelopes, unknown fields, and transaction opt-outs', async () => {
    expect((await PATCH(request('PATCH', '{bad'))).status).toBe(400)
    expect((await PATCH(request('PATCH', JSON.stringify({ negotiations: false })))).status).toBe(400)
    expect((await PATCH(request('PATCH', JSON.stringify({ preferences: { growth: false } })))).status).toBe(400)

    const mandatory = await PATCH(request('PATCH', JSON.stringify({ preferences: { transactions: false } })))
    expect(mandatory.status).toBe(400)
    expect((await mandatory.json()).error).toMatch(/required/i)
    expect(refs.upserted).toBeNull()
  })

  it('returns 500 when the owner-scoped write fails', async () => {
    refs.writeError = { message: 'rls denied' }
    const response = await PATCH(request('PATCH', JSON.stringify({ preferences: { reviews: false } })))
    expect(response.status).toBe(500)
  })

  it('enforces rate limiting and authentication before accepting writes', async () => {
    refs.rateLimitResponse = NextResponse.json({ error: 'rate' }, { status: 429 })
    expect((await PATCH(request('PATCH', JSON.stringify({ preferences: { reviews: false } })))).status).toBe(429)

    refs.rateLimitResponse = null
    refs.user = null
    expect((await PATCH(request('PATCH', JSON.stringify({ preferences: { reviews: false } })))).status).toBe(401)
    expect(refs.upserted).toBeNull()
  })
})
