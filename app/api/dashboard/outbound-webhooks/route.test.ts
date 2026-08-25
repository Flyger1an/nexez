import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../../test/supabase-mock'
import { decryptSecret, encryptSecret } from '../../../../lib/server/secret-crypto'

const refs = vi.hoisted(() => ({
  client: null as any,
  allowed: true,
  rows: [] as any[],
  calls: [] as QueryContext[],
  delivery: { ok: true, status: 200 } as any,
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({})) }))
vi.mock('../../../../utils/supabase/server', () => ({ createClient: vi.fn(() => refs.client) }))
vi.mock('../../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => true),
  createAdminClient: vi.fn(() => refs.client),
}))
vi.mock('../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('../../../../lib/server/plan', () => ({ ownerAllows: vi.fn(async () => refs.allowed) }))
vi.mock('../../../../lib/webhooks', () => ({
  getWebhookEndpointError: vi.fn(() => null),
  getResolvedWebhookEndpointError: vi.fn(async () => null),
  fireOutboundWebhook: vi.fn(async () => refs.delivery),
}))

import { GET, POST } from './route'
import { fireOutboundWebhook } from '../../../../lib/webhooks'

const KEY = '33'.repeat(32)
const request = (body?: unknown) => new Request('https://app.nexez.ai/api/dashboard/outbound-webhooks', {
  method: body === undefined ? 'GET' : 'POST',
  headers: body === undefined ? undefined : { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

function buildClient() {
  return createSupabaseMock((context) => {
    refs.calls.push(context)
    if (context.table !== 'outbound_webhooks') return { data: null, error: null }
    if (context.op === 'select') {
      const id = context.eqs.id
      return { data: id ? refs.rows.find((row) => row.id === id) ?? null : refs.rows, error: null }
    }
    if (context.op === 'insert') {
      const row = {
        id: 'webhook-new',
        active: true,
        last_delivery_at: null,
        last_status: null,
        created_at: '2026-08-25T00:00:00Z',
        ...context.payload,
      }
      refs.rows.unshift(row)
      return { data: row, error: null }
    }
    return { data: null, error: null }
  }, { user: { id: 'owner-1' } })
}

describe('/api/dashboard/outbound-webhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('INTEGRATION_SECRET_KEY', KEY)
    refs.allowed = true
    refs.calls = []
    refs.delivery = { ok: true, status: 200 }
    refs.rows = []
    refs.client = buildClient()
  })
  afterEach(() => vi.unstubAllEnvs())

  it('stores an encrypted secret, returns plaintext once, then lists presence only', async () => {
    const created = await POST(request({ url: 'https://hooks.zapier.com/hooks/catch/1/abc' }))
    expect(created.status).toBe(201)
    const createdJson = await created.json()
    expect(createdJson.webhook.secret).toMatch(/^whsec_/)
    expect(createdJson.webhook.has_secret).toBe(true)
    const inserted = refs.calls.find((call) => call.op === 'insert')?.payload
    expect(inserted.secret).not.toBe(createdJson.webhook.secret)
    expect(decryptSecret(inserted.secret)).toBe(createdJson.webhook.secret)

    const listed = await GET(request())
    const listedJson = await listed.json()
    expect(listedJson.webhooks[0]).toMatchObject({ id: 'webhook-new', has_secret: true })
    expect(listedJson.webhooks[0]).not.toHaveProperty('secret')
  })

  it('decrypts the stored secret for a test without returning it', async () => {
    const encrypted = encryptSecret('server-secret')
    refs.rows = [{ id: 'webhook-1', owner_id: 'owner-1', url: 'https://hooks.example.com/a', secret: encrypted }]
    const response = await POST(request({ action: 'test', id: 'webhook-1' }))
    expect(response.status).toBe(200)
    expect(fireOutboundWebhook).toHaveBeenCalledWith(
      'https://hooks.example.com/a',
      'server-secret',
      expect.objectContaining({ event: 'test.webhook' }),
    )
    expect(JSON.stringify(await response.json())).not.toContain('server-secret')
  })

  it('fails closed when encryption is not configured', async () => {
    vi.stubEnv('INTEGRATION_SECRET_KEY', '')
    const response = await POST(request({ url: 'https://hooks.example.com/a' }))
    expect(response.status).toBe(503)
    expect(refs.calls.some((call) => call.op === 'insert')).toBe(false)
  })
})
