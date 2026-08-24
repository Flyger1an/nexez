import { afterEach, describe, expect, it, vi } from 'vitest'

const captureError = vi.hoisted(() => vi.fn())

vi.mock('./observability', () => ({
  captureError,
}))

import { NEXEZ_SUPPORT_REPLY_TO, NEXEZ_TRANSACTIONAL_FROM, sendEmail } from './email'

describe('sendEmail delivery observability', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    captureError.mockReset()
  })

  it('reports a provider rejection without exposing the recipient', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"rejected"}', { status: 422 })))

    const result = await sendEmail({
      to: 'owner@example.com',
      subject: 'Seller update',
      html: '<p>Update</p>',
    })

    expect(result.ok).toBe(false)
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
      area: 'email-send',
      provider: 'resend',
      status: 422,
    })
    expect(JSON.stringify(captureError.mock.calls)).not.toContain('owner@example.com')
  })

  it('reports a provider network failure without changing the returned contract', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network unavailable') }))

    await expect(sendEmail({
      to: 'owner@example.com',
      subject: 'Seller update',
      html: '<p>Update</p>',
    })).resolves.toEqual({ ok: false, error: 'network unavailable' })
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
      area: 'email-send',
      provider: 'resend',
    })
  })

  it('uses the approved sender, support reply address, transactional tag, and optional idempotency key', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test')
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ id: 'email-1' })))

    await expect(sendEmail({
      to: 'owner@example.com',
      subject: 'Seller update',
      html: '<p>Update</p>',
      idempotencyKey: 'seller-update/order-1',
    })).resolves.toEqual({ ok: true, id: 'email-1' })

    const fetchMock = vi.mocked(fetch)
    const [, init] = fetchMock.mock.calls[0]
    const headers = init?.headers as Record<string, string>
    const body = JSON.parse(String(init?.body))

    expect(headers['Idempotency-Key']).toBe('seller-update/order-1')
    expect(body).toMatchObject({
      from: 'Nexez <notifications@nexez.ai>',
      reply_to: NEXEZ_SUPPORT_REPLY_TO,
      tags: [{ name: 'stream', value: 'transactional' }],
    })
  })

  it('does not allow a legacy sender override to replace the approved Nexez identity', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test')
    vi.stubEnv('EMAIL_FROM', 'notifications@updates.nexez.app')
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ id: 'email-2' })))

    await sendEmail({
      to: 'owner@example.com',
      subject: 'Seller update',
      html: '<p>Update</p>',
    })

    const [, init] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(String(init?.body))

    expect(body.from).toBe(NEXEZ_TRANSACTIONAL_FROM)
  })
})
