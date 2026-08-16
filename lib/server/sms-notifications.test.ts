import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../test/supabase-mock'

const refs = vi.hoisted(() => ({
  hasAdminEnv: vi.fn(() => true),
  createAdminClient: vi.fn(),
  deliveryReady: vi.fn(() => true),
  sendSellerNegotiationSms: vi.fn(),
}))

vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: refs.hasAdminEnv,
  createAdminClient: refs.createAdminClient,
}))
vi.mock('./sms', () => ({
  isTwilioMessagingDeliveryReady: refs.deliveryReady,
  sendSellerNegotiationSms: refs.sendSellerNegotiationSms,
}))

import { deliverQueuedSmsNotifications, enqueueSellerNegotiationSms } from './sms-notifications'

const OWNER = '11111111-1111-4111-8111-111111111111'
const NEGOTIATION = '22222222-2222-4222-8222-222222222222'
const EVENT = '33333333-3333-4333-8333-333333333333'

function enqueueAdmin(options?: { destination?: boolean; subscription?: boolean; insertError?: any }) {
  const contexts: QueryContext[] = []
  const admin = createSupabaseMock((ctx: QueryContext) => {
    contexts.push(ctx)
    if (ctx.table === 'user_sms_destinations') {
      return { data: options?.destination === false ? null : { id: 'destination-1' }, error: null }
    }
    if (ctx.table === 'sms_subscriptions') {
      return { data: options?.subscription === false ? null : { user_id: OWNER }, error: null }
    }
    if (ctx.table === 'sms_notification_events') {
      return { data: { id: 'event-1' }, error: options?.insertError ?? null }
    }
    return { data: null, error: null }
  }) as any
  return { admin, contexts }
}

describe('seller negotiation SMS outbox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.hasAdminEnv.mockReturnValue(true)
    refs.deliveryReady.mockReturnValue(true)
  })

  it('inserts one generic, de-duplicated event only for a verified opted-in owner', async () => {
    const { admin, contexts } = enqueueAdmin()
    const result = await enqueueSellerNegotiationSms({ ownerId: OWNER, negotiationId: NEGOTIATION, admin })
    expect(result).toEqual({ queued: true, eventId: 'event-1' })
    const eventCall = contexts.find((ctx) => ctx.table === 'sms_notification_events')!
    const insertCall = eventCall.payload
    expect(insertCall).toMatchObject({
      user_id: OWNER,
      destination_id: 'destination-1',
      negotiation_id: NEGOTIATION,
      topic: 'seller_negotiation',
      template_key: 'seller_new_negotiation',
    })
    expect(insertCall.dedupe_key).toBe(`sms:seller-negotiation:${NEGOTIATION}`)
    expect(insertCall.payload_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(insertCall)).not.toMatch(/buyer|offer|body|phone/i)
  })

  it('skips when the account has no active verified destination or subscription', async () => {
    await expect(enqueueSellerNegotiationSms({ ownerId: OWNER, negotiationId: NEGOTIATION, admin: enqueueAdmin({ destination: false }).admin })).resolves.toEqual({
      queued: false,
      reason: 'no_destination',
    })
    await expect(enqueueSellerNegotiationSms({ ownerId: OWNER, negotiationId: NEGOTIATION, admin: enqueueAdmin({ subscription: false }).admin })).resolves.toEqual({
      queued: false,
      reason: 'not_opted_in',
    })
  })

  it('collapses a unique duplicate into a safe replay no-op', async () => {
    const result = await enqueueSellerNegotiationSms({
      ownerId: OWNER,
      negotiationId: NEGOTIATION,
      admin: enqueueAdmin({ insertError: { code: '23505' } }).admin,
    })
    expect(result).toEqual({ queued: false, reason: 'already_queued' })
  })

  it('suppresses an ineligible claimed row without calling Twilio', async () => {
    const admin = createSupabaseMock((ctx: QueryContext) => {
      if (ctx.table === 'sms_notification_events' && ctx.op === 'update') return { data: [{ id: EVENT }], error: null }
      return { data: null, error: null }
    }) as any
    admin.rpc = vi.fn(async (name: string) => {
      if (name === 'claim_sms_notification_events') return {
        data: [{
          event_id: EVENT,
          destination_id: 'destination-1',
          phone_e164: '+14155552671',
          topic: 'seller_negotiation',
          template_key: 'seller_new_negotiation',
          delivery_eligible: false,
        }],
        error: null,
      }
      return { data: false, error: null }
    })
    const result = await deliverQueuedSmsNotifications({ admin })
    expect(result).toMatchObject({ claimed: 1, suppressed: 1 })
    expect(refs.sendSellerNegotiationSms).not.toHaveBeenCalled()
  })

  it('rechecks eligibility immediately before sending and suppresses a newly opted-out claimed event', async () => {
    const contexts: QueryContext[] = []
    const admin = createSupabaseMock((ctx: QueryContext) => {
      contexts.push(ctx)
      if (ctx.table === 'sms_notification_events' && ctx.op === 'update') return { data: [{ id: EVENT }], error: null }
      return { data: null, error: null }
    }) as any
    admin.rpc = vi.fn(async (name: string) => {
      if (name === 'claim_sms_notification_events') return {
        data: [{
          event_id: EVENT,
          destination_id: 'destination-1',
          phone_e164: '+14155552671',
          topic: 'seller_negotiation',
          template_key: 'seller_new_negotiation',
          delivery_eligible: true,
        }],
        error: null,
      }
      if (name === 'sms_notification_event_is_deliverable') return { data: false, error: null }
      return { data: null, error: { message: 'unexpected RPC' } }
    })

    const result = await deliverQueuedSmsNotifications({ admin })

    expect(result).toMatchObject({ claimed: 1, suppressed: 1, accepted: 0, failed: 0 })
    expect(admin.rpc).toHaveBeenCalledWith('sms_notification_event_is_deliverable', { p_event_id: EVENT })
    expect(refs.sendSellerNegotiationSms).not.toHaveBeenCalled()
    const suppress = contexts.find((ctx) => ctx.table === 'sms_notification_events' && ctx.op === 'update')
    expect(suppress?.payload).toEqual({ status: 'suppressed', error_code: 'not_eligible' })
    expect(suppress?.calls).toContainEqual(['eq', 'id', EVENT])
    expect(suppress?.calls).toContainEqual(['eq', 'status', 'sending'])
  })

  it('persists Twilio acceptance but never a message body', async () => {
    const contexts: QueryContext[] = []
    const admin = createSupabaseMock((ctx: QueryContext) => {
      contexts.push(ctx)
      if (ctx.table === 'sms_notification_events' && ctx.op === 'update') return { data: [{ id: EVENT }], error: null }
      return { data: null, error: null }
    }) as any
    admin.rpc = vi.fn(async (name: string) => {
      if (name === 'claim_sms_notification_events') return {
        data: [{
          event_id: EVENT,
          destination_id: 'destination-1',
          phone_e164: '+14155552671',
          topic: 'seller_negotiation',
          template_key: 'seller_new_negotiation',
          delivery_eligible: true,
        }],
        error: null,
      }
      return { data: true, error: null }
    })
    refs.sendSellerNegotiationSms.mockResolvedValue({ ok: true, messageSid: 'SM123', status: 'queued' })
    const result = await deliverQueuedSmsNotifications({ admin })
    expect(result).toMatchObject({ claimed: 1, accepted: 1 })
    expect(refs.sendSellerNegotiationSms).toHaveBeenCalledWith({ to: '+14155552671', eventId: EVENT })
    const payload = contexts.find((ctx) => ctx.table === 'sms_notification_events' && ctx.op === 'update')!.payload
    expect(payload).toMatchObject({ status: 'accepted', message_sid: 'SM123' })
    expect(JSON.stringify(payload)).not.toMatch(/body|phone|offer|buyer/i)
  })
})
