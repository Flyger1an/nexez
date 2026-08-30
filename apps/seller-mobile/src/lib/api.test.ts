import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkPageSlugAvailability,
  escrowAction,
  getIntakeSession,
  refundOrder,
  transitionNegotiation,
  updateOrderRequestStatus,
  webPath,
} from './api'

const refs = vi.hoisted(() => ({
  getSession: vi.fn(),
}))

vi.mock('./config', () => ({ config: { apiUrl: 'https://app.nexez.test' } }))
vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: refs.getSession } },
}))

describe('mobile platform API contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.getSession.mockResolvedValue({ data: { session: { access_token: 'seller-token' } } })
  })

  it('checks page slugs through the authenticated platform route', async () => {
    const fetchMock = vi.fn(async () => Response.json({
      value: 'fresh-shop',
      available: true,
      reason: 'available',
      message: 'Available',
      suggestions: [],
    }))
    vi.stubGlobal('fetch', fetchMock)

    await checkPageSlugAvailability({ value: 'fresh-shop', subjectId: 'page id/1' })

    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://app.nexez.test/api/public-identifiers/availability?namespace=page_slug&value=fresh-shop&subjectId=page+id%2F1')
    expect(new Headers(options.headers).get('authorization')).toBe('Bearer seller-token')
  })

  it('builds web handoffs on the configured canonical app host', () => {
    expect(webPath('/dashboard/settings#team')).toBe('https://app.nexez.test/dashboard/settings#team')
    expect(webPath('create?url=https%3A%2F%2Fexample.com')).toBe(
      'https://app.nexez.test/create?url=https%3A%2F%2Fexample.com',
    )
  })

  it('encodes intake thread IDs as one path segment', async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await getIntakeSession('thread/with spaces')

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      'https://app.nexez.test/api/agents/intake/threads/thread%2Fwith%20spaces',
    )
  })

  it('updates buyer-request status only through the canonical server action', async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true, status: 'declined' }))
    vi.stubGlobal('fetch', fetchMock)

    await updateOrderRequestStatus({ id: 'request-1', status: 'declined' })

    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://app.nexez.test/api/orders/request-status')
    expect(options.method).toBe('POST')
    expect(JSON.parse(String(options.body))).toEqual({ id: 'request-1', status: 'declined' })
    expect(new Headers(options.headers).get('authorization')).toBe('Bearer seller-token')
  })

  it.each([
    {
      label: 'negotiation decision',
      run: () => transitionNegotiation({
        negotiationId: 'negotiation-1',
        decision: { action: 'counter', reasoning: 'Revised scope', counter: { priceCents: 125_00 } },
      }),
      path: '/api/negotiations/transition',
      body: {
        negotiationId: 'negotiation-1',
        decision: { action: 'counter', reasoning: 'Revised scope', counter: { priceCents: 125_00 } },
      },
    },
    {
      label: 'escrow action',
      run: () => escrowAction({ negotiationId: 'negotiation-1', action: 'refund', amount: 25 }),
      path: '/api/negotiations/escrow',
      body: { negotiationId: 'negotiation-1', action: 'refund', amount: 25 },
    },
    {
      label: 'direct-order refund',
      run: () => refundOrder({ orderId: 'order-1', amount: 25 }),
      path: '/api/orders/refund',
      body: { orderId: 'order-1', amount: 25 },
    },
  ])('sends each $label through its bearer-authenticated server authority', async ({ run, path, body }) => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await run()

    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://app.nexez.test${path}`)
    expect(options.method).toBe('POST')
    expect(JSON.parse(String(options.body))).toEqual(body)
    expect(new Headers(options.headers).get('authorization')).toBe('Bearer seller-token')
  })

  it('surfaces the server error contract without exposing response internals', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(
      { error: 'Public name availability is temporarily unavailable.', internal: 'hidden' },
      { status: 503 },
    )))

    await expect(checkPageSlugAvailability({ value: 'fresh-shop' }))
      .rejects.toThrow('Public name availability is temporarily unavailable.')
  })
})
