import { beforeEach, describe, expect, it, vi } from 'vitest'

const refs = vi.hoisted(() => ({
  gate: null as any,
  page: { id: 'page-1', slug: 'acme', name: 'Acme' } as any,
  stored: [{ url: 'https://hooks.zapier.com/hooks/catch/1/abc', secret: 'stored-secret' }] as any,
  allowed: true,
  delivery: { ok: true, status: 200 } as any,
}))

vi.mock('../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('../../../lib/server/plan', () => ({ ownerAllows: vi.fn(async () => refs.allowed) }))
vi.mock('../../../lib/webhooks', () => ({
  fireOutboundWebhook: vi.fn(async () => refs.delivery),
}))
vi.mock('../../../lib/server/outbound-webhook-config', () => ({
  outboundWebhooksForDelivery: () => refs.stored,
}))
vi.mock('../../../lib/server/require-page-access', () => ({
  requirePageAccess: vi.fn(async () => refs.gate),
}))

import { POST } from './route'
import { fireOutboundWebhook } from '../../../lib/webhooks'
import { requirePageAccess } from '../../../lib/server/require-page-access'

function admin() {
  return {
    from(table: string) {
      const query: any = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => table === 'pages'
          ? { data: refs.page, error: null }
          : { data: { outbound_webhooks: [] }, error: null },
      }
      return query
    },
  }
}

const request = (body: unknown) => new Request('https://app.nexez.ai/api/test-outbound', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

describe('POST /api/test-outbound', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.gate = {
      ok: true,
      access: { pageId: 'page-1', ownerId: 'owner-1', role: 'editor' },
      admin: admin(),
    }
    refs.page = { id: 'page-1', slug: 'acme', name: 'Acme' }
    refs.stored = [{ url: 'https://hooks.zapier.com/hooks/catch/1/abc', secret: 'stored-secret' }]
    refs.allowed = true
    refs.delivery = { ok: true, status: 200 }
  })

  it('authorizes editor access and uses only the saved server-side secret and fixed payload', async () => {
    const response = await POST(request({
      endpoint: 'https://hooks.zapier.com/hooks/catch/1/abc',
      pageId: 'page-1',
      secret: 'attacker-secret',
      eventType: 'attacker.event',
      data: { injected: true },
    }))
    expect(response.status).toBe(200)
    expect(requirePageAccess).toHaveBeenCalledWith(expect.objectContaining({ pageId: 'page-1' }))
    expect(fireOutboundWebhook).toHaveBeenCalledWith(
      'https://hooks.zapier.com/hooks/catch/1/abc',
      'stored-secret',
      expect.objectContaining({
        event: 'test.webhook',
        page: { id: 'page-1', slug: 'acme', name: 'Acme' },
        data: expect.not.objectContaining({ injected: true }),
      }),
    )
  })

  it('rejects unsaved endpoints without making a network request', async () => {
    const response = await POST(request({ endpoint: 'https://other.example.com/hook', pageId: 'page-1' }))
    expect(response.status).toBe(404)
    expect(fireOutboundWebhook).not.toHaveBeenCalled()
  })

  it('preserves access and plan gates', async () => {
    refs.gate = { ok: false, response: new Response('{}', { status: 403 }) }
    expect((await POST(request({ endpoint: 'https://hooks.zapier.com/hooks/catch/1/abc', pageId: 'page-1' }))).status).toBe(403)

    refs.gate = { ok: true, access: { pageId: 'page-1', ownerId: 'owner-1' }, admin: admin() }
    refs.allowed = false
    expect((await POST(request({ endpoint: 'https://hooks.zapier.com/hooks/catch/1/abc', pageId: 'page-1' }))).status).toBe(402)
  })
})
