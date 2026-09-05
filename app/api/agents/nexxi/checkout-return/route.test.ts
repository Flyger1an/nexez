import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authRef, lookup } = vi.hoisted(() => ({
  authRef: { ok: true as boolean },
  lookup: vi.fn(),
}))

vi.mock('../../../../../lib/agents/nexxi-auth', () => ({
  authenticateNexxiRequest: vi.fn(async () => authRef.ok
    ? { ok: true, user: { id: 'buyer-1' } }
    : { ok: false, response: Response.json({ error: 'Unauthorized' }, { status: 401 }) }),
}))
vi.mock('../../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('../../../../../lib/server/load-order', () => ({ loadBuyerOrderTokenBySession: lookup }))

import { GET } from './route'

const request = (sessionId: string) => new Request(
  `https://app.nexez.ai/api/agents/nexxi/checkout-return?session_id=${encodeURIComponent(sessionId)}`,
) as never

describe('GET /api/agents/nexxi/checkout-return', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authRef.ok = true
  })

  it('resolves only the authenticated buyer session to a receipt token', async () => {
    lookup.mockResolvedValue({ token: 'order_token_123', status: 'paid' })
    const response = await GET(request('cs_test_12345678'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      state: 'ready',
      kind: 'order',
      token: 'order_token_123',
      status: 'paid',
    })
    expect(lookup).toHaveBeenCalledWith('cs_test_12345678', 'buyer-1')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('returns pending without disclosing whether another buyer owns the session', async () => {
    lookup.mockResolvedValue(null)
    const response = await GET(request('cs_test_12345678'))
    expect(await response.json()).toEqual({ ok: true, state: 'pending' })
  })
  it('surfaces a database failure instead of asking a paid buyer to wait for a webhook', async () => {
    lookup.mockRejectedValue(new Error('Buyer order return lookup failed'))
    const response = await GET(request('cs_test_12345678'))
    expect(response.status).toBe(500)
    expect(await response.json()).not.toMatchObject({ state: 'pending' })
  })

  it('rejects malformed session identifiers before lookup', async () => {
    const response = await GET(request('../session'))
    expect(response.status).toBe(400)
    expect(lookup).not.toHaveBeenCalled()
  })
})
