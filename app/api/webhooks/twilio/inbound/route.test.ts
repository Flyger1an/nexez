import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '@/test/supabase-mock'

const {
  getTwilioConfigurationStatus,
  getTwilioMessagingServiceSid,
  validateTwilioWebhookSignature,
  normalizeE164PhoneNumber,
  createAdminClient,
  hasSupabaseAdminEnv,
  suppressPendingSmsNotifications,
} = vi.hoisted(() => ({
  getTwilioConfigurationStatus: vi.fn(),
  getTwilioMessagingServiceSid: vi.fn(),
  validateTwilioWebhookSignature: vi.fn(),
  normalizeE164PhoneNumber: vi.fn(),
  createAdminClient: vi.fn(),
  hasSupabaseAdminEnv: vi.fn(),
  suppressPendingSmsNotifications: vi.fn(),
}))

vi.mock('@/lib/server/sms', () => ({
  getTwilioConfigurationStatus,
  getTwilioMessagingServiceSid,
  validateTwilioWebhookSignature,
  normalizeE164PhoneNumber,
}))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient, hasSupabaseAdminEnv }))
vi.mock('@/lib/server/sms-notifications', () => ({ suppressPendingSmsNotifications }))

import { POST } from './route'

const MESSAGING_SERVICE = `MG${'a'.repeat(32)}`

function post(params: Record<string, string>, signature = 'valid-signature') {
  return new Request('https://preview.invalid/api/webhooks/twilio/inbound', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': signature,
    },
    body: new URLSearchParams({ MessagingServiceSid: MESSAGING_SERVICE, ...params }).toString(),
  })
}

let queries: QueryContext[]
const ACTIVE_DESTINATION = { id: 'destination-1', user_id: 'seller-1' }

function configureAdmin(handler: (ctx: QueryContext) => { data?: unknown; error?: unknown }) {
  createAdminClient.mockReturnValue(
    createSupabaseMock((ctx) => {
      queries.push(ctx)
      return handler(ctx)
    }) as any,
  )
}

function standardDb(destination: { id: string; user_id: string } | null = ACTIVE_DESTINATION) {
  configureAdmin((ctx) => {
    if (ctx.table === 'user_sms_destinations' && ctx.op === 'select') return { data: destination, error: null }
    return { data: null, error: null }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  queries = []
  getTwilioConfigurationStatus.mockReturnValue({
    webhookValidationConfigured: true,
    statusCallbackConfigured: true,
    inboundWebhookConfigured: true,
  })
  getTwilioMessagingServiceSid.mockReturnValue(MESSAGING_SERVICE)
  validateTwilioWebhookSignature.mockReturnValue(true)
  normalizeE164PhoneNumber.mockImplementation((value: string | null | undefined) => value?.trim() || null)
  hasSupabaseAdminEnv.mockReturnValue(true)
  suppressPendingSmsNotifications.mockResolvedValue(true)
  standardDb()
})

describe('POST /api/webhooks/twilio/inbound', () => {
  it('returns 503 when Twilio webhook configuration is missing, before database access', async () => {
    getTwilioConfigurationStatus.mockReturnValue({
      webhookValidationConfigured: false,
      inboundWebhookConfigured: true,
    })

    const res = await POST(post({ From: '+14155550123', Body: 'STOP' }))

    expect(res.status).toBe(503)
    expect(validateTwilioWebhookSignature).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('returns 403 for a bad signature before it can inspect or mutate SMS preferences', async () => {
    validateTwilioWebhookSignature.mockReturnValue(false)

    const res = await POST(post({ From: '+14155550123', Body: 'STOP' }, 'not-twilio'))

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'invalid_signature' })
    expect(validateTwilioWebhookSignature).toHaveBeenCalledWith({
      kind: 'inbound',
      signature: 'not-twilio',
      params: { MessagingServiceSid: MESSAGING_SERVICE, From: '+14155550123', Body: 'STOP' },
    })
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('revokes the matching active E.164 destination and opts its seller-notification subscription out on STOP', async () => {
    normalizeE164PhoneNumber.mockReturnValue('+14155550123')

    const res = await POST(post({ From: ' +14155550123 ', Body: 'STOP' }))

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/xml')
    expect(await res.text()).toBe('<?xml version="1.0" encoding="UTF-8"?><Response/>')
    expect(normalizeE164PhoneNumber).toHaveBeenCalledWith(' +14155550123 ')

    const lookup = queries.find((query) => query.table === 'user_sms_destinations' && query.op === 'select')
    expect(lookup?.calls).toContainEqual(['eq', 'phone_e164', '+14155550123'])
    expect(lookup?.calls).toContainEqual(['is', 'revoked_at', null])

    const subscription = queries.find((query) => query.table === 'sms_subscriptions' && query.op === 'update')
    expect(subscription?.payload).toMatchObject({ opted_out_at: expect.any(String) })
    expect(subscription?.calls).toContainEqual(['eq', 'user_id', 'seller-1'])
    expect(subscription?.calls).toContainEqual(['eq', 'topic', 'seller_negotiation'])
    expect(subscription?.calls).toContainEqual(['is', 'opted_out_at', null])

    const destination = queries.find((query) => query.table === 'user_sms_destinations' && query.op === 'update')
    expect(destination?.payload).toMatchObject({ revoked_at: expect.any(String) })
    expect(destination?.calls).toContainEqual(['eq', 'id', 'destination-1'])
    expect(destination?.calls).toContainEqual(['is', 'revoked_at', null])
  })

  it('honors Twilio Advanced Opt-Out STOP metadata even when the body is not a keyword', async () => {
    const res = await POST(post({ From: '+14155550123', Body: 'unrelated', OptOutType: 'STOP' }))

    expect(res.status).toBe(200)
    expect(queries.some((query) => query.table === 'sms_subscriptions' && query.op === 'update')).toBe(true)
  })

  it('never lets START re-enroll a number; it responds with blank TwiML and no DB access', async () => {
    const res = await POST(post({ From: '+14155550123', Body: 'START' }))

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('<?xml version="1.0" encoding="UTF-8"?><Response/>')
    expect(normalizeE164PhoneNumber).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('treats a signed STOP from another Messaging Service as a no-op', async () => {
    const otherService = `MG${'b'.repeat(32)}`

    const res = await POST(post({ MessagingServiceSid: otherService, From: '+14155550123', Body: 'STOP' }))

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('<?xml version="1.0" encoding="UTF-8"?><Response/>')
    expect(getTwilioMessagingServiceSid).toHaveBeenCalledTimes(1)
    expect(normalizeE164PhoneNumber).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(suppressPendingSmsNotifications).not.toHaveBeenCalled()
    expect(queries).toHaveLength(0)
  })

  it('returns blank TwiML for HELP and unrecognized inbound traffic', async () => {
    const help = await POST(post({ From: '+14155550123', Body: 'HELP' }))
    const other = await POST(post({ From: '+14155550123', Body: 'hello' }))

    expect(help.status).toBe(200)
    expect(other.status).toBe(200)
    expect(await help.text()).toBe('<?xml version="1.0" encoding="UTF-8"?><Response/>')
    expect(await other.text()).toBe('<?xml version="1.0" encoding="UTF-8"?><Response/>')
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('does not mutate anything when STOP comes from an unknown or invalid destination', async () => {
    standardDb(null)
    normalizeE164PhoneNumber.mockReturnValue('+14155550123')

    const res = await POST(post({ From: '+14155550123', Body: 'STOP' }))

    expect(res.status).toBe(200)
    expect(queries).toHaveLength(1)
    expect(queries[0]).toMatchObject({ table: 'user_sms_destinations', op: 'select' })
  })

  it('returns a generic 503 when opt-out persistence fails and does not revoke the destination first', async () => {
    configureAdmin((ctx) => {
      if (ctx.table === 'user_sms_destinations' && ctx.op === 'select') return { data: ACTIVE_DESTINATION, error: null }
      if (ctx.table === 'sms_subscriptions' && ctx.op === 'update') return { data: null, error: { message: 'private database failure' } }
      return { data: null, error: null }
    })

    const res = await POST(post({ From: '+14155550123', Body: 'STOP' }))

    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'unavailable' })
    expect(queries.some((query) => query.table === 'user_sms_destinations' && query.op === 'update')).toBe(false)
  })
})
