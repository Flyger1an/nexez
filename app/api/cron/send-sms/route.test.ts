import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refs = vi.hoisted(() => ({
  hasAdminEnv: vi.fn(() => true),
  createAdminClient: vi.fn(() => ({ kind: 'admin' })),
  deliveryReady: vi.fn(() => true),
  deliver: vi.fn(),
}))

vi.mock('@/utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: refs.hasAdminEnv,
  createAdminClient: refs.createAdminClient,
}))
vi.mock('@/lib/server/sms', () => ({ isTwilioMessagingDeliveryReady: refs.deliveryReady }))
vi.mock('@/lib/server/sms-notifications', () => ({ deliverQueuedSmsNotifications: refs.deliver }))

import { GET } from './route'

const SECRET = 'cron-secret-xyz'
const request = (authorization?: string) =>
  new Request('https://nexez.test/api/cron/send-sms', authorization ? { headers: { authorization } } : undefined)

describe('GET /api/cron/send-sms', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('CRON_SECRET', SECRET)
    refs.hasAdminEnv.mockReturnValue(true)
    refs.deliveryReady.mockReturnValue(true)
    refs.deliver.mockResolvedValue({ claimed: 2, accepted: 1, failed: 0, suppressed: 1, skipped: false })
  })
  afterEach(() => vi.unstubAllEnvs())

  it('requires the CRON_SECRET bearer token before checking any configuration', async () => {
    expect((await GET(request())).status).toBe(401)
    expect((await GET(request(`Bearer ${SECRET}-wrong`))).status).toBe(401)
    expect(refs.deliver).not.toHaveBeenCalled()
  })

  it('fails closed until both the durable store and authenticated delivery path are configured', async () => {
    refs.deliveryReady.mockReturnValue(false)
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ ok: false, error: 'sms_not_configured' })
    expect(refs.deliver).not.toHaveBeenCalled()
  })

  it('drains only the claimed durable outbox and returns aggregate counts', async () => {
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, claimed: 2, accepted: 1, suppressed: 1 })
    expect(refs.deliver).toHaveBeenCalledWith({ admin: { kind: 'admin' } })
  })
})
