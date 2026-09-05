// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestRefund } from './refund-request'
const body = { orderId: 'order-fixture', amount: 20 }
const key = 'nexez:refund:v1:order:order-fixture'

describe('browser refund intent across lost responses', () => {
  beforeEach(() => { localStorage.clear(); vi.unstubAllGlobals() })
  it('keeps the operation ID after a network failure and clears it only after acknowledged success', async () => {
    const calls: string[] = []
    const fetch = vi.fn(async (_path, options) => {
      const payload = JSON.parse(options.body)
      calls.push(payload.operationId)
      if (calls.length === 1) throw new Error('Response lost')
      return Response.json({ ok: true, operationId: payload.operationId })
    })
    vi.stubGlobal('fetch', fetch)
    await expect(requestRefund('/api/orders/refund', body)).rejects.toThrow('Response lost')
    expect(localStorage.getItem(key)).not.toBeNull()
    await requestRefund('/api/orders/refund', body)
    expect(calls[0]).toBe(calls[1])
    expect(localStorage.getItem(key)).toBeNull()
    await requestRefund('/api/orders/refund', body)
    expect(calls[2]).not.toBe(calls[1])
  })
  it('retains the ID if the response body is lost after HTTP 200 headers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('incomplete json', { status: 200 })))
    await requestRefund('/api/orders/refund', body)
    expect(localStorage.getItem(key)).not.toBeNull()
  })
  it('rejects an amount change while the previous outcome is unknown', async () => {
    const fetch = vi.fn(async () => Response.json({ error: 'pending' }, { status: 503 }))
    vi.stubGlobal('fetch', fetch)
    await requestRefund('/api/orders/refund', body)
    await expect(requestRefund('/api/orders/refund', { ...body, amount: 30 })).rejects.toThrow('previous refund amount')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('does not let a delayed duplicate response clear a later refund intent', async () => {
    let release!: (response: Response) => void
    let oldId = ''
    const fetch = vi.fn(async (_path, options) => {
      oldId = JSON.parse(options.body).operationId
      return new Promise<Response>((resolve) => { release = resolve })
    })
    vi.stubGlobal('fetch', fetch)
    const pending = requestRefund('/api/orders/refund', body)
    const next = JSON.stringify({ operationId: crypto.randomUUID(), request: JSON.stringify({ amount: 30 }) })
    localStorage.setItem(key, next)
    release(Response.json({ ok: true, operationId: oldId }))
    await pending
    expect(localStorage.getItem(key)).toBe(next)
  })
})
