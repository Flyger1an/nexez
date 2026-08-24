import { afterEach, describe, expect, it, vi } from 'vitest'

const captureError = vi.hoisted(() => vi.fn())

vi.mock('./observability', () => ({
  captureError,
}))

import { sendEmail } from './email'

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
})
