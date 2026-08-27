import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '@/test/supabase-mock'

const {
  getTwilioConfigurationStatus,
  normalizeSmsNotificationEventId,
  validateTwilioWebhookSignature,
  createAdminClient,
  hasSupabaseAdminEnv,
} = vi.hoisted(() => ({
  getTwilioConfigurationStatus: vi.fn(),
  normalizeSmsNotificationEventId: vi.fn(),
  validateTwilioWebhookSignature: vi.fn(),
  createAdminClient: vi.fn(),
  hasSupabaseAdminEnv: vi.fn(),
}))

vi.mock('@/lib/server/sms', () => ({
  getTwilioConfigurationStatus,
  normalizeSmsNotificationEventId,
  validateTwilioWebhookSignature,
}))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient, hasSupabaseAdminEnv }))

import { mapTwilioMessageStatus } from '../_shared'
import { POST } from './route'

const MESSAGE_SID = `SM${'a'.repeat(32)}`

const EVENT_ID = '11111111-1111-4111-8111-111111111111'

function post(params: Record<string, string>, signature = 'valid-signature', eventId?: string) {
  const url = new URL('https://preview.invalid/api/webhooks/twilio/status')
  if (eventId) url.searchParams.set('event', eventId)
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': signature,
    },
    body: new URLSearchParams(params).toString(),
  })
}

let queries: QueryContext[]

function configureAdmin(handler: (ctx: QueryContext) => { data?: unknown; error?: unknown } = () => ({ data: null, error: null })) {
  createAdminClient.mockReturnValue(
    createSupabaseMock((ctx) => {
      queries.push(ctx)
      return handler(ctx)
    }) as any,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  queries = []
  getTwilioConfigurationStatus.mockReturnValue({
    webhookValidationConfigured: true,
    statusCallbackConfigured: true,
    inboundWebhookConfigured: true,
  })
  validateTwilioWebhookSignature.mockReturnValue(true)
  normalizeSmsNotificationEventId.mockImplementation((value: string | null | undefined) => value || null)
  hasSupabaseAdminEnv.mockReturnValue(true)
  configureAdmin()
})

describe('POST /api/webhooks/twilio/status', () => {
  it('returns 503 when webhook validation is not configured, before parsing or accessing data', async () => {
    getTwilioConfigurationStatus.mockReturnValue({
      webhookValidationConfigured: false,
      statusCallbackConfigured: true,
    })

    const res = await POST(post({ MessageSid: MESSAGE_SID, MessageStatus: 'delivered' }))

    expect(res.status).toBe(503)
    expect(validateTwilioWebhookSignature).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('returns 403 for an invalid signature before accessing the service-role client', async () => {
    validateTwilioWebhookSignature.mockReturnValue(false)

    const res = await POST(post({ MessageSid: MESSAGE_SID, MessageStatus: 'delivered' }, 'not-twilio'))

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'invalid_signature' })
    expect(validateTwilioWebhookSignature).toHaveBeenCalledWith({
      kind: 'status',
      signature: 'not-twilio',
      params: { MessageSid: MESSAGE_SID, MessageStatus: 'delivered' },
    })
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('records a delivered callback with no provider text and excludes a delivered event from regression', async () => {
    const res = await POST(post({ MessageSid: MESSAGE_SID, MessageStatus: 'delivered', ErrorCode: 'not-safe-to-store' }))

    expect(res.status).toBe(204)
    expect(queries).toHaveLength(1)
    const query = queries[0]
    expect(query.table).toBe('sms_notification_events')
    expect(query.op).toBe('update')
    expect(query.payload).toMatchObject({
      status: 'delivered',
      error_code: null,
      delivered_at: expect.any(String),
    })
    expect(query.calls).toContainEqual(['eq', 'message_sid', MESSAGE_SID])
    expect(query.calls).toContainEqual(['neq', 'status', 'delivered'])
  })

  it('maps intermediate sending callbacks to accepted without allowing a later status to regress from sent', async () => {
    const res = await POST(post({ MessageSid: MESSAGE_SID, MessageStatus: 'sending' }))

    expect(res.status).toBe(204)
    expect(queries[0].payload).toMatchObject({ status: 'accepted', accepted_at: expect.any(String), error_code: null })
    expect(queries[0].calls).toContainEqual(['in', 'status', ['queued', 'sending', 'accepted', 'suppressed']])
  })

  it('correlates a signed event-specific callback before a sender has persisted its Message SID', async () => {
    const eventId = '22222222-2222-4222-8222-222222222222'
    const callbackMessageSid = `SM${'b'.repeat(32)}`

    const res = await POST(post({ MessageSid: callbackMessageSid, MessageStatus: 'sent' }, 'valid-signature', eventId))

    expect(res.status).toBe(204)
    expect(validateTwilioWebhookSignature).toHaveBeenCalledWith({
      kind: 'status',
      signature: 'valid-signature',
      params: { MessageSid: callbackMessageSid, MessageStatus: 'sent' },
      statusEventId: eventId,
    })
    expect(queries).toHaveLength(1)
    expect(queries[0].payload).toEqual({ status: 'sent', error_code: null, message_sid: callbackMessageSid })
    expect(queries[0].calls).toContainEqual(['eq', 'id', eventId])
    expect(queries[0].calls).toContainEqual(['or', `message_sid.is.null,message_sid.eq.${callbackMessageSid}`])
    expect(queries[0].calls).not.toContainEqual(['eq', 'message_sid', callbackMessageSid])
  })

  it('sanitizes a failed delivery code and never permits the failure to overwrite delivered', async () => {
    const res = await POST(post({ MessageSid: MESSAGE_SID, MessageStatus: 'failed', ErrorCode: '30007' }))

    expect(res.status).toBe(204)
    expect(queries[0].payload).toEqual({ status: 'failed', error_code: 'twilio_30007' })
    expect(queries[0].calls).toContainEqual(['in', 'status', ['queued', 'sending', 'accepted', 'sent', 'failed', 'suppressed']])
  })

  it('acknowledges an unknown but signed callback without a database mutation', async () => {
    const res = await POST(post({ MessageSid: MESSAGE_SID, MessageStatus: 'read' }))

    expect(res.status).toBe(204)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(queries).toHaveLength(0)
  })

  it('uses only recognized durable status mappings', () => {
    expect(mapTwilioMessageStatus('queued')).toBe('accepted')
    expect(mapTwilioMessageStatus('sent')).toBe('sent')
    expect(mapTwilioMessageStatus('delivered')).toBe('delivered')
    expect(mapTwilioMessageStatus('undelivered')).toBe('undelivered')
    expect(mapTwilioMessageStatus('failed')).toBe('failed')
    expect(mapTwilioMessageStatus('something_else')).toBeNull()
  })
})
