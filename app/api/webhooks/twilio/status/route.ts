import { NextResponse } from 'next/server'
import { createAdminClient, hasSupabaseAdminEnv } from '@/utils/supabase/admin'
import {
  hasValidTwilioWebhookSignature,
  invalidSignatureResponse,
  isTwilioWebhookConfigured,
  malformedRequestResponse,
  readTwilioFormParams,
  statusCallbackEventId,
  unavailableResponse,
} from '../_shared'

export const runtime = 'nodejs'

type SmsNotificationStatus = 'accepted' | 'sent' | 'delivered' | 'undelivered' | 'failed'

const MESSAGE_SID = /^SM[a-f0-9]{32}$/i

/**
 * Twilio can emit intermediate states such as queued and sending. Nexez only
 * persists the durable delivery states used by the outbox, with queued/sending
 * both meaning Twilio accepted responsibility for the message.
 */
export function mapTwilioMessageStatus(value: string | undefined): SmsNotificationStatus | null {
  switch (value?.trim().toLowerCase()) {
    case 'queued':
    case 'sending':
    case 'accepted':
      return 'accepted'
    case 'sent':
      return 'sent'
    case 'delivered':
      return 'delivered'
    case 'undelivered':
      return 'undelivered'
    case 'failed':
      return 'failed'
    default:
      return null
  }
}

function messageSidOf(params: Record<string, string>): string | null {
  const sid = params.MessageSid ?? params.SmsSid
  return sid && MESSAGE_SID.test(sid) ? sid : null
}

/** Persist only a short, safe provider code — never Twilio's raw error text. */
function errorCodeOf(value: string | undefined, status: SmsNotificationStatus): string | null {
  if (status !== 'failed' && status !== 'undelivered') return null
  const code = value?.trim() ?? ''
  return /^\d{3,6}$/.test(code) ? `twilio_${code}` : 'twilio_delivery_failed'
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isTwilioWebhookConfigured('status')) return unavailableResponse()

  const params = await readTwilioFormParams(request)
  if (!params) return malformedRequestResponse()
  if (!hasValidTwilioWebhookSignature(request, 'status', params)) return invalidSignatureResponse()

  // Signature validation intentionally completes before any database access.
  if (!hasSupabaseAdminEnv()) return unavailableResponse()

  const messageSid = messageSidOf(params)
  const status = mapTwilioMessageStatus(params.MessageStatus ?? params.SmsStatus)
  const eventId = statusCallbackEventId(request)
  // A valid but unrecognized callback needs no retry and must not mutate an event.
  if (!messageSid || !status) return new NextResponse(null, { status: 204 })

  const now = new Date().toISOString()
  const update: {
    status: SmsNotificationStatus
    error_code: string | null
    message_sid?: string
    accepted_at?: string
    delivered_at?: string
  } = {
    status,
    error_code: errorCodeOf(params.ErrorCode, status),
  }
  // An event-specific callback can arrive before the sender has recorded the
  // provider SID. Its signed URL lets us durably correlate that callback now.
  if (eventId) update.message_sid = messageSid
  if (status === 'accepted') update.accepted_at = now
  if (status === 'delivered') update.delivered_at = now

  const admin = createAdminClient()
  let query = admin
    .from('sms_notification_events')
    .update(update)

  if (eventId) {
    // A signed callback may fill the SID first; otherwise it must agree with
    // the sender's persisted SID. This blocks an unrelated Twilio callback from
    // binding a different message to the event.
    query = query
      .eq('id', eventId)
      .or(`message_sid.is.null,message_sid.eq.${messageSid}`)
  } else {
    query = query.eq('message_sid', messageSid)
  }

  // Late or duplicate callbacks are common. Preserve state monotonicity and,
  // most importantly, never let a stale intermediate result regress delivery.
  // `suppressed` is a local cancellation fence. A valid Twilio callback proves
  // a request had already reached the provider, so it is allowed to replace
  // that fence with the provider-observed outcome for an honest audit record.
  if (status === 'accepted') {
    query = query.in('status', ['queued', 'sending', 'accepted', 'suppressed'])
  } else if (status === 'sent') {
    query = query.in('status', ['queued', 'sending', 'accepted', 'sent', 'suppressed'])
  } else if (status === 'failed') {
    query = query.in('status', ['queued', 'sending', 'accepted', 'sent', 'failed', 'suppressed'])
  } else if (status === 'undelivered') {
    query = query.in('status', ['queued', 'sending', 'accepted', 'sent', 'undelivered', 'suppressed'])
  } else {
    // Delivered is authoritative, but a second delivered callback remains a no-op.
    query = query.neq('status', 'delivered')
  }

  const { error } = await query
  if (error) {
    // Deliberately do not log the provider payload, message SID, or raw database error.
    return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  }

  return new NextResponse(null, { status: 204 })
}
