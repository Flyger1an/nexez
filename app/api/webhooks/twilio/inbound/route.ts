import { NextResponse } from 'next/server'
import { getTwilioMessagingServiceSid, normalizeE164PhoneNumber } from '@/lib/server/sms'
import { suppressPendingSmsNotifications } from '@/lib/server/sms-notifications'
import { createAdminClient, hasSupabaseAdminEnv } from '@/utils/supabase/admin'
import {
  blankTwimlResponse,
  hasValidTwilioWebhookSignature,
  invalidSignatureResponse,
  isTwilioWebhookConfigured,
  malformedRequestResponse,
  readTwilioFormParams,
  unavailableResponse,
} from '../_shared'

export const runtime = 'nodejs'

const STOP_WORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'])

function inboundCommand(params: Record<string, string>): 'stop' | 'start' | 'help' | 'other' {
  const optOutType = params.OptOutType?.trim().toUpperCase()
  if (optOutType === 'STOP') return 'stop'
  if (optOutType === 'START') return 'start'
  if (optOutType === 'HELP') return 'help'

  const body = params.Body?.trim().toUpperCase() ?? ''
  if (STOP_WORDS.has(body)) return 'stop'
  if (body === 'START') return 'start'
  if (body === 'HELP') return 'help'
  return 'other'
}

type ActiveDestination = { id: string; user_id: string }

export async function POST(request: Request): Promise<NextResponse> {
  if (!isTwilioWebhookConfigured('inbound')) return unavailableResponse()

  const params = await readTwilioFormParams(request)
  if (!params) return malformedRequestResponse()
  if (!hasValidTwilioWebhookSignature(request, 'inbound', params)) return invalidSignatureResponse()

  // Signature validation intentionally completes before any database access.
  if (!hasSupabaseAdminEnv()) return unavailableResponse()
  // The account token validates the request came from Twilio, while this second
  // check scopes preference changes to Nexez's configured Messaging Service.
  if (params.MessagingServiceSid !== getTwilioMessagingServiceSid()) return blankTwimlResponse()

  const command = inboundCommand(params)
  // START never re-enrolls a number. A new account-settings consent + Verify
  // flow is required; HELP and ordinary inbound messages are handled by Twilio
  // Advanced Opt-Out and receive no app-level response body.
  if (command !== 'stop') return blankTwimlResponse()

  const phone = normalizeE164PhoneNumber(params.From)
  if (!phone) return blankTwimlResponse()

  const admin = createAdminClient()
  const { data: destination, error: destinationLookupError } = await admin
    .from('user_sms_destinations')
    .select('id, user_id')
    .eq('phone_e164', phone)
    .is('revoked_at', null)
    .maybeSingle<ActiveDestination>()

  if (destinationLookupError) return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  if (!destination) return blankTwimlResponse()

  const now = new Date().toISOString()
  // Opt out first: if a transient failure occurs before the destination is
  // revoked, the durable subscription gate still prevents a future SMS send.
  const { error: subscriptionError } = await admin
    .from('sms_subscriptions')
    .update({ opted_out_at: now })
    .eq('user_id', destination.user_id)
    .eq('topic', 'seller_negotiation')
    .is('opted_out_at', null)

  if (subscriptionError) return NextResponse.json({ error: 'unavailable' }, { status: 503 })

  if (!(await suppressPendingSmsNotifications({ userId: destination.user_id, admin, reason: 'opted_out' }))) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  }

  const { error: revokeError } = await admin
    .from('user_sms_destinations')
    .update({ revoked_at: now })
    .eq('id', destination.id)
    .is('revoked_at', null)

  if (revokeError) return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  return blankTwimlResponse()
}
