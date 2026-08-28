import { NextResponse } from 'next/server'
import {
  getTwilioConfigurationStatus,
  normalizeSmsNotificationEventId,
  type TwilioWebhookKind,
  validateTwilioWebhookSignature,
} from '@/lib/server/sms'

export type TwilioFormParams = Record<string, string>
export type SmsNotificationStatus = 'accepted' | 'sent' | 'delivered' | 'undelivered' | 'failed'

/** Normalize Twilio's transient and terminal states to the durable outbox states. */
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

/**
 * Twilio signs every form field, so parse the request exactly once and pass the
 * unmodified string fields to the SDK validator. Its webhooks are
 * application/x-www-form-urlencoded; non-string entries are never accepted.
 */
export async function readTwilioFormParams(request: Request): Promise<TwilioFormParams | null> {
  try {
    const formData = await request.formData()
    const entries = Array.from(formData.entries()).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    )
    return Object.fromEntries(entries)
  } catch {
    return null
  }
}

/** Configuration must exist before a callback can be trusted or persisted. */
export function isTwilioWebhookConfigured(kind: TwilioWebhookKind): boolean {
  const status = getTwilioConfigurationStatus()
  return status.webhookValidationConfigured && (
    kind === 'status' ? status.statusCallbackConfigured : status.inboundWebhookConfigured
  )
}

/**
 * Each outbound message has a signed, event-specific status URL. Parsing the
 * opaque UUID from an untrusted request is safe; it is still covered by Twilio's
 * request signature before any data access happens.
 */
export function statusCallbackEventId(request: Request): string | null {
  try {
    return normalizeSmsNotificationEventId(new URL(request.url).searchParams.get('event'))
  } catch {
    return null
  }
}

/**
 * Validate against the stable HTTPS URL configured for this endpoint, never the
 * request host (which may be an internal Vercel host or attacker-controlled).
 */
export function hasValidTwilioWebhookSignature(
  request: Request,
  kind: TwilioWebhookKind,
  params: TwilioFormParams,
): boolean {
  const eventId = kind === 'status' ? statusCallbackEventId(request) : null
  return validateTwilioWebhookSignature({
    kind,
    signature: request.headers.get('x-twilio-signature'),
    params,
    ...(eventId ? { statusEventId: eventId } : {}),
  })
}

export function unavailableResponse(): NextResponse {
  return NextResponse.json({ error: 'unavailable' }, { status: 503 })
}

export function invalidSignatureResponse(): NextResponse {
  return NextResponse.json({ error: 'invalid_signature' }, { status: 403 })
}

export function malformedRequestResponse(): NextResponse {
  return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
}

/** Advanced Opt-Out owns any customer-facing STOP/HELP reply. */
export function blankTwimlResponse(): NextResponse {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
    status: 200,
    headers: { 'content-type': 'text/xml; charset=utf-8' },
  })
}
