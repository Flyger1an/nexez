import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  user: { id: 'u1', email: 'o@x.com', email_confirmed_at: 't' } as any,
  gate: { ok: true } as any,
  result: { ok: true, provider: 'shopify', imported: 3, windows: 0, availabilitySynced: false, note: 'Imported 3' } as any,
  syncArgs: null as any,
}))

vi.mock('next/headers', () => ({ cookies: async () => ({}) }))
vi.mock('../../../../../../../lib/rate-limit', () => ({ enforceRateLimit: async () => null }))
vi.mock('../../../../../../../utils/supabase/server', () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }) }))
vi.mock('../../../../../../../utils/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('../../../../../../../lib/server/integration-importers', () => ({ gateIntegrationImport: async () => h.gate }))
vi.mock('../../../../../../../lib/server/integration-sync', () => ({
  isSyncProvider: (p: string) => p === 'calendly' || p === 'shopify',
  syncPageIntegration: async (_admin: any, provider: string, pageId: string) => { h.syncArgs = { provider, pageId }; return h.result },
}))

import { POST } from './route'

const req = () => new Request('https://nexez.test/api/pages/pg1/integrations/shopify/sync', { method: 'POST' })
const ctx = (provider: string) => ({ params: Promise.resolve({ id: 'pg1', provider }) })

describe('POST /api/pages/[id]/integrations/[provider]/sync', () => {
  beforeEach(() => {
    h.user = { id: 'u1', email: 'o@x.com', email_confirmed_at: 't' }
    h.gate = { ok: true }
    h.result = { ok: true, provider: 'shopify', imported: 3, windows: 0, availabilitySynced: false, note: 'Imported 3' }
    h.syncArgs = null
  })

  it('400 for an unsupported provider (never touches auth/sync)', async () => {
    const res = await POST(req(), ctx('stripe'))
    expect(res.status).toBe(400)
    expect(h.syncArgs).toBeNull()
  })

  it('401 when not authenticated', async () => {
    h.user = null
    expect((await POST(req(), ctx('shopify'))).status).toBe(401)
  })

  it('propagates the gate failure status', async () => {
    h.gate = { ok: false, status: 402, error: 'Upgrade to Pro' }
    const res = await POST(req(), ctx('shopify'))
    expect(res.status).toBe(402)
    expect(h.syncArgs).toBeNull()
  })

  it('delegates to syncPageIntegration and returns its result', async () => {
    const res = await POST(req(), ctx('shopify'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, provider: 'shopify', imported: 3, availability_synced: false })
    expect(h.syncArgs).toEqual({ provider: 'shopify', pageId: 'pg1' })
  })

  it('maps a sync failure to its status', async () => {
    h.result = { ok: false, status: 400, error: 'Connect Shopify in Settings before syncing.' }
    const res = await POST(req(), ctx('shopify'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/connect shopify/i)
  })
})
