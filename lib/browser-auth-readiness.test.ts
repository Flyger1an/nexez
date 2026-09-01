import { describe, expect, it, vi } from 'vitest'
import {
  AUTH_SESSION_PROBE_PATH,
  probeServerAuthSession,
  waitForServerAuthSession,
} from './browser-auth-readiness'

describe('probeServerAuthSession', () => {
  it('uses a same-origin, no-store request and accepts only the authenticated response', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }))

    await expect(probeServerAuthSession(fetcher)).resolves.toBe(true)
    expect(fetcher).toHaveBeenCalledWith(AUTH_SESSION_PROBE_PATH, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { accept: 'application/json' },
    })

    fetcher.mockResolvedValueOnce(new Response(null, { status: 401 }))
    await expect(probeServerAuthSession(fetcher)).resolves.toBe(false)
  })
})

describe('waitForServerAuthSession', () => {
  it('retries transient anonymous and network responses until the server sees the session', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('dev server restarted'))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const sleep = vi.fn(async () => undefined)

    await expect(waitForServerAuthSession({
      fetcher,
      sleep,
      retryDelaysMs: [0, 25, 50],
    })).resolves.toBe(true)

    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenNthCalledWith(1, 25)
    expect(sleep).toHaveBeenNthCalledWith(2, 50)
  })

  it('fails closed after the bounded retry schedule', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 401 }))
    const sleep = vi.fn(async () => undefined)

    await expect(waitForServerAuthSession({
      fetcher,
      sleep,
      retryDelaysMs: [0, 10, 20],
    })).resolves.toBe(false)

    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })
})
