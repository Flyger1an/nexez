import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { constructEvent } = vi.hoisted(() => ({ constructEvent: vi.fn() }))
vi.mock('stripe', () => ({ default: class { webhooks = { constructEvent } } }))

import { POST } from './route'

const post = (opts: { sig?: string; body?: string } = {}) =>
  new Request('https://nexez.test/api/webhooks/stripe', {
    method: 'POST',
    headers: opts.sig ? { 'stripe-signature': opts.sig } : {},
    body: opts.body ?? '{}',
  }) as any

describe('POST /api/webhooks/stripe', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllEnvs())

  it('412 when STRIPE_WEBHOOK_SECRET is not configured', async () => {
    expect((await POST(post({ sig: 't=1,v1=x' }))).status).toBe(412)
  })

  it('400 when the Stripe signature header is missing', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test')
    expect((await POST(post({}))).status).toBe(400)
  })

  it('401 when signature verification fails', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test')
    constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature')
    })
    expect((await POST(post({ sig: 'bad' }))).status).toBe(401)
  })

  it('200 acknowledges a verified event', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test')
    constructEvent.mockReturnValue({ type: 'checkout.session.completed', data: { object: {} } })
    const res = await POST(post({ sig: 'good', body: '{"id":"evt_1"}' }))
    expect(res.status).toBe(200)
    expect((await res.json()).received).toBe(true)
  })
})
