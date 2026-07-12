import { describe, it, expect, vi, afterEach } from 'vitest'
import crypto from 'node:crypto'
import {
  buildAcpOrderEvent,
  signAcpOrderPayload,
  sendAcpOrderEvent,
  acpStatusFromOrderStatus,
  acpOrderWebhookConfigured,
} from '../server/acp-order-webhook'

afterEach(() => vi.unstubAllEnvs())

describe('acpStatusFromOrderStatus', () => {
  it('maps Nexez order status → ACP status', () => {
    expect(acpStatusFromOrderStatus('paid')).toBe('confirmed')
    expect(acpStatusFromOrderStatus('refunded')).toBe('canceled')
    expect(acpStatusFromOrderStatus('disputed')).toBe('manual_review')
    expect(acpStatusFromOrderStatus('dispute_won')).toBe('confirmed')
    expect(acpStatusFromOrderStatus(null)).toBe('confirmed')
  })
})

describe('buildAcpOrderEvent', () => {
  it('shapes the order event, omitting empty refunds/id', () => {
    expect(buildAcpOrderEvent('order_updated', { checkoutSessionId: 'sess_1', permalinkUrl: 'https://x/orders/t', status: 'confirmed' })).toEqual({
      type: 'order_updated',
      data: { type: 'order', checkout_session_id: 'sess_1', permalink_url: 'https://x/orders/t', status: 'confirmed' },
    })
  })
  it('includes id + refunds when present', () => {
    const ev = buildAcpOrderEvent('order_updated', {
      orderId: 'pi_1',
      checkoutSessionId: 'sess_1',
      permalinkUrl: 'https://x/orders/t',
      status: 'canceled',
      refunds: [{ type: 'refund', amount: 5000, currency: 'usd' }],
    })
    expect(ev.data).toMatchObject({ id: 'pi_1', status: 'canceled', refunds: [{ type: 'refund', amount: 5000, currency: 'usd' }] })
  })
})

describe('signAcpOrderPayload', () => {
  it('is a base64 HMAC-SHA256 of the body', () => {
    const sig = signAcpOrderPayload('{"a":1}', 'secret')
    expect(sig).toBe(crypto.createHmac('sha256', 'secret').update('{"a":1}', 'utf8').digest('base64'))
  })
})

describe('sendAcpOrderEvent', () => {
  const input = { checkoutSessionId: 'sess_1', permalinkUrl: 'https://x/orders/t', status: 'canceled' as const, orderId: 'pi_1', refunds: [{ type: 'refund', amount: 5000, currency: 'usd' }] }

  it('no-ops (skipped) when unconfigured', async () => {
    const fetchImpl = vi.fn()
    const res = await sendAcpOrderEvent('order_updated', input, { fetchImpl: fetchImpl as any })
    expect(res).toEqual({ ok: false, skipped: true })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(acpOrderWebhookConfigured()).toBe(false)
  })

  it('POSTs a signed event when configured', async () => {
    vi.stubEnv('ACP_ORDER_WEBHOOK_URL', 'https://openai.example/orders')
    vi.stubEnv('ACP_ORDER_WEBHOOK_SECRET', 's3cret')
    expect(acpOrderWebhookConfigured()).toBe(true)
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }) as any)
    const res = await sendAcpOrderEvent('order_updated', input, { fetchImpl, nowIso: '2026-07-12T00:00:00.000Z' })
    expect(res).toEqual({ ok: true, status: 200 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://openai.example/orders')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    // Signature is over the exact body sent.
    expect(headers.signature).toBe(signAcpOrderPayload(init.body as string, 's3cret'))
    expect(headers.timestamp).toBe('2026-07-12T00:00:00.000Z')
    expect(headers['api-version']).toBeTruthy()
    expect(JSON.parse(init.body as string).data.status).toBe('canceled')
  })

  it('never throws on a fetch failure (best-effort)', async () => {
    vi.stubEnv('ACP_ORDER_WEBHOOK_URL', 'https://openai.example/orders')
    vi.stubEnv('ACP_ORDER_WEBHOOK_SECRET', 's3cret')
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down')
    })
    const res = await sendAcpOrderEvent('order_updated', input, { fetchImpl: fetchImpl as any })
    expect(res).toEqual({ ok: false, error: 'network down' })
  })
})
