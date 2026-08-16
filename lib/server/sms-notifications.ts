import 'server-only'

import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { isTwilioMessagingDeliveryReady, sendSellerNegotiationSms } from './sms'

export const SELLER_NEGOTIATION_SMS_TOPIC = 'seller_negotiation' as const
export const SELLER_NEW_NEGOTIATION_SMS_TEMPLATE = 'seller_new_negotiation' as const

const CLAIM_LIMIT = 20

type ActiveDestination = { id: string }
type ActiveSubscription = { user_id: string }
type ClaimedSmsEvent = {
  event_id: string
  destination_id: string
  phone_e164: string | null
  topic: string
  template_key: string
  delivery_eligible: boolean
}

export type EnqueueSellerNegotiationSmsResult =
  | { queued: true; eventId?: string }
  | { queued: false; reason: 'not_configured' | 'no_destination' | 'not_opted_in' | 'already_queued' | 'database_error' }

export type DeliverQueuedSmsResult = {
  claimed: number
  accepted: number
  failed: number
  suppressed: number
  /** Provider/database ordering left a claimed row unresolved; it is never retried automatically. */
  unsettled: number
  skipped: boolean
}

function notificationPayloadHash(negotiationId: string): string {
  // Hash only an immutable internal event identity and the fixed template
  // version. Never persist offer, buyer, phone, message body, or action data.
  return createHash('sha256').update(`nexez:sms:v1:${SELLER_NEW_NEGOTIATION_SMS_TEMPLATE}:${negotiationId}`).digest('hex')
}

function serviceAdmin(client?: SupabaseClient): SupabaseClient | null {
  if (client) return client
  return hasSupabaseAdminEnv() ? createAdminClient() : null
}

/**
 * Prevent every not-yet-finalized event for an account from reaching Twilio.
 * The account subscription remains the source of truth; this is the extra
 * queue-level fence for work a worker may already have claimed.
 */
export async function suppressPendingSmsNotifications(input: {
  userId: string
  admin?: SupabaseClient
  reason?: 'opted_out'
}): Promise<boolean> {
  const admin = serviceAdmin(input.admin)
  if (!admin || !input.userId) return false
  const { error } = await admin
    .from('sms_notification_events')
    .update({ status: 'suppressed', error_code: input.reason ?? 'opted_out' })
    .eq('user_id', input.userId)
    .in('status', ['queued', 'sending'])
  return !error
}

/**
 * Insert the durable, de-duplicated v1 seller notification. This performs no
 * network call and does not depend on `after()` completing; the cron worker
 * delivers it later. A missing/opted-out/unverified destination is silently
 * skipped so SMS can never affect proposal creation.
 */
export async function enqueueSellerNegotiationSms(input: {
  ownerId: string | null | undefined
  negotiationId: string
  admin?: SupabaseClient
}): Promise<EnqueueSellerNegotiationSmsResult> {
  if (!input.ownerId || !input.negotiationId) return { queued: false, reason: 'no_destination' }
  if (!isTwilioMessagingDeliveryReady()) return { queued: false, reason: 'not_configured' }

  const admin = serviceAdmin(input.admin)
  if (!admin) return { queued: false, reason: 'not_configured' }

  const { data: destination, error: destinationError } = await admin
    .from('user_sms_destinations')
    .select('id')
    .eq('user_id', input.ownerId)
    .is('revoked_at', null)
    .not('verified_at', 'is', null)
    .maybeSingle<ActiveDestination>()
  if (destinationError) return { queued: false, reason: 'database_error' }
  if (!destination) return { queued: false, reason: 'no_destination' }

  const { data: subscription, error: subscriptionError } = await admin
    .from('sms_subscriptions')
    .select('user_id')
    .eq('user_id', input.ownerId)
    .eq('topic', SELLER_NEGOTIATION_SMS_TOPIC)
    .not('opted_in_at', 'is', null)
    .is('opted_out_at', null)
    .maybeSingle<ActiveSubscription>()
  if (subscriptionError) return { queued: false, reason: 'database_error' }
  if (!subscription) return { queued: false, reason: 'not_opted_in' }

  const dedupeKey = `sms:seller-negotiation:${input.negotiationId}`
  const { data, error } = await admin
    .from('sms_notification_events')
    .insert({
      dedupe_key: dedupeKey,
      user_id: input.ownerId,
      destination_id: destination.id,
      negotiation_id: input.negotiationId,
      topic: SELLER_NEGOTIATION_SMS_TOPIC,
      template_key: SELLER_NEW_NEGOTIATION_SMS_TEMPLATE,
      payload_hash: notificationPayloadHash(input.negotiationId),
    })
    .select('id')
    .maybeSingle<{ id: string }>()

  if (error) {
    // Unique dedupe is the successful no-op path for request replays.
    if (error.code === '23505') return { queued: false, reason: 'already_queued' }
    return { queued: false, reason: 'database_error' }
  }
  return { queued: true, eventId: data?.id }
}

async function markEvent(
  admin: SupabaseClient,
  eventId: string,
  patch: Record<string, unknown>,
): Promise<'updated' | 'not_sending' | 'error'> {
  // The claim has already made this event `sending`; bind the transition so a
  // concurrent callback cannot be overwritten by a late worker write.
  const { data, error } = await admin
    .from('sms_notification_events')
    .update(patch)
    .eq('id', eventId)
    .eq('status', 'sending')
    .select('id')
  if (error) return 'error'
  return data?.length ? 'updated' : 'not_sending'
}

async function recheckDeliveryEligibility(
  admin: SupabaseClient,
  eventId: string,
): Promise<'eligible' | 'not_eligible' | 'error'> {
  // A user may press Turn off SMS or reply STOP after a worker claims a row.
  // Check the durable account state immediately before the external request.
  const { data, error } = await admin.rpc('sms_notification_event_is_deliverable', { p_event_id: eventId })
  if (error) return 'error'
  return data === true ? 'eligible' : 'not_eligible'
}

/**
 * Drain a bounded batch of the outbox. The database function atomically claims
 * rows with SKIP LOCKED. A stale claim is failed (not retried) because an
 * ambiguous request to Twilio must never duplicate a transactional SMS.
 */
export async function deliverQueuedSmsNotifications(input?: {
  admin?: SupabaseClient
  limit?: number
}): Promise<DeliverQueuedSmsResult> {
  const admin = serviceAdmin(input?.admin)
  if (!admin || !isTwilioMessagingDeliveryReady()) {
    return { claimed: 0, accepted: 0, failed: 0, suppressed: 0, unsettled: 0, skipped: true }
  }

  const limit = Math.min(CLAIM_LIMIT, Math.max(1, Math.floor(input?.limit ?? CLAIM_LIMIT)))
  const { data, error } = await admin.rpc('claim_sms_notification_events', { p_limit: limit })
  if (error) {
    // Cron callers report only aggregate failure; phone/provider data is never logged.
    return { claimed: 0, accepted: 0, failed: 0, suppressed: 0, unsettled: 0, skipped: false }
  }

  const events = (data ?? []) as ClaimedSmsEvent[]
  const result: DeliverQueuedSmsResult = {
    claimed: events.length,
    accepted: 0,
    failed: 0,
    suppressed: 0,
    unsettled: 0,
    skipped: false,
  }
  for (const event of events) {
    if (
      !event.delivery_eligible ||
      !event.phone_e164 ||
      event.topic !== SELLER_NEGOTIATION_SMS_TOPIC ||
      event.template_key !== SELLER_NEW_NEGOTIATION_SMS_TEMPLATE
    ) {
      const marked = await markEvent(admin, event.event_id, { status: 'suppressed', error_code: 'not_eligible' })
      if (marked === 'error') result.unsettled += 1
      else result.suppressed += 1
      continue
    }

    const eligibility = await recheckDeliveryEligibility(admin, event.event_id)
    if (eligibility !== 'eligible') {
      const marked = await markEvent(admin, event.event_id, {
        status: eligibility === 'error' ? 'failed' : 'suppressed',
        error_code: eligibility === 'error' ? 'eligibility_check_failed' : 'not_eligible',
      })
      if (marked === 'error') result.unsettled += 1
      else if (eligibility === 'error') result.failed += 1
      else result.suppressed += 1
      continue
    }

    const sent = await sendSellerNegotiationSms({ to: event.phone_e164, eventId: event.event_id })
    if (sent.ok) {
      const marked = await markEvent(admin, event.event_id, {
        status: 'accepted',
        message_sid: sent.messageSid,
        accepted_at: new Date().toISOString(),
        error_code: null,
      })
      // A status callback can win this race and persist the message SID first.
      // Either way, do not call Twilio again; unresolved rows age out as failed.
      if (marked === 'updated') result.accepted += 1
      else result.unsettled += 1
      continue
    }

    const marked = await markEvent(admin, event.event_id, {
      status: sent.skipped ? 'suppressed' : 'failed',
      error_code: sent.errorCode,
    })
    if (marked === 'error') result.unsettled += 1
    else if (sent.skipped) result.suppressed += 1
    else result.failed += 1
  }

  return result
}
