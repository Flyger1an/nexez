import { NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { enforceRateLimit, hasSharedRateLimitBackend } from '@/lib/rate-limit'
import { resolveRequestAuth } from '@/lib/server/request-auth'
import {
  checkSmsPhoneVerification,
  getTwilioConfigurationStatus,
  normalizeE164PhoneNumber,
  startSmsPhoneVerification,
} from '@/lib/server/sms'
import { createAdminClient, hasSupabaseAdminEnv } from '@/utils/supabase/admin'
import { suppressPendingSmsNotifications } from '@/lib/server/sms-notifications'
import { SMS_CONSENT_VERSION } from '@/lib/sms-consent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const SMS_TOPIC = 'seller_negotiation'
const SMS_RATE_LIMIT_SECRET_MIN_LENGTH = 32

type SmsDestinationRow = {
  phone_e164: string
  verified_at: string | null
}

type SmsSubscriptionRow = {
  consented_at: string | null
  opted_in_at: string | null
  opted_out_at: string | null
}

type SmsStatus = {
  available: boolean
  verificationAvailable: boolean
  messagingAvailable: boolean
  enabled: boolean
  destination: { phoneMasked: string; verifiedAt: string | null } | null
  subscription: { consentedAt: string | null; optedInAt: string | null; optedOutAt: string | null } | null
}

type SmsAction =
  | { action: 'start'; phone: string; consent: true }
  | { action: 'verify'; phone: string; code: string }
  | { action: 'disable' }

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key))
}

function parseAction(value: unknown): SmsAction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>

  if (input.action === 'start') {
    if (!hasOnlyKeys(input, ['action', 'phone', 'consent']) || typeof input.phone !== 'string' || input.consent !== true) return null
    const phone = normalizeE164PhoneNumber(input.phone)
    return phone ? { action: 'start', phone, consent: true } : null
  }

  if (input.action === 'verify') {
    if (!hasOnlyKeys(input, ['action', 'phone', 'code']) || typeof input.phone !== 'string' || typeof input.code !== 'string') return null
    const phone = normalizeE164PhoneNumber(input.phone)
    const code = input.code.trim()
    // The Twilio helper also validates the code. This inexpensive limit avoids
    // accepting an arbitrarily large untrusted body before it gets there.
    if (!phone || code.length < 4 || code.length > 10) return null
    return { action: 'verify', phone, code }
  }

  if (input.action === 'disable' && hasOnlyKeys(input, ['action'])) return { action: 'disable' }
  return null
}

function hasSmsRateLimitSecret(): boolean {
  return (process.env.NEXEZ_SMS_RATE_LIMIT_SECRET?.trim().length ?? 0) >= SMS_RATE_LIMIT_SECRET_MIN_LENGTH
}

/**
 * Rate-limit keys must not leak E.164 values into Redis/KV. A deployment-only
 * HMAC gives every account the same opaque bucket for the same number.
 */
function smsPhoneRateLimitSubject(phone: string): string | null {
  const secret = process.env.NEXEZ_SMS_RATE_LIMIT_SECRET?.trim()
  if (!secret || secret.length < SMS_RATE_LIMIT_SECRET_MIN_LENGTH) return null
  return createHmac('sha256', secret).update(`nexez:sms:verify:${phone}`).digest('base64url')
}

function isSmsRuntimeReady(): boolean {
  const status = getTwilioConfigurationStatus()
  return Boolean(
    hasSupabaseAdminEnv()
      && status.apiCredentialsConfigured
      && status.messagingConfigured
      && status.verifyConfigured
      && status.webhookValidationConfigured
      && status.statusCallbackConfigured
      && status.inboundWebhookConfigured
      && hasSharedRateLimitBackend()
      && hasSmsRateLimitSecret()
  )
}

function smsAvailability(): Pick<SmsStatus, 'available' | 'verificationAvailable' | 'messagingAvailable'> {
  const status = getTwilioConfigurationStatus()
  const storageReady = hasSupabaseAdminEnv()
  const ready = Boolean(
    storageReady
      && status.apiCredentialsConfigured
      && status.messagingConfigured
      && status.verifyConfigured
      && status.webhookValidationConfigured
      && status.statusCallbackConfigured
      && status.inboundWebhookConfigured
      && hasSharedRateLimitBackend()
      && hasSmsRateLimitSecret(),
  )

  return {
    available: ready,
    // Starting or checking a challenge is intentionally blocked until every
    // sender and callback safeguard is present, not merely Verify credentials.
    verificationAvailable: ready,
    messagingAvailable: Boolean(
      storageReady
        && status.apiCredentialsConfigured
        && status.messagingConfigured
        && status.webhookValidationConfigured
        && status.statusCallbackConfigured,
    ),
  }
}

/** Return no country code or complete phone number to the browser. */
function maskPhone(phone: string): string {
  const normalized = normalizeE164PhoneNumber(phone)
  return normalized ? `••••${normalized.slice(-4)}` : '••••'
}

function asSingleRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? data[0] ?? null : data
}

async function loadSmsStatus(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<SmsStatus | null> {
  const [destinationResult, subscriptionResult] = await Promise.all([
    admin
      .from('user_sms_destinations')
      .select('phone_e164, verified_at')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .not('verified_at', 'is', null)
      .maybeSingle<SmsDestinationRow>(),
    admin
      .from('sms_subscriptions')
      .select('consented_at, opted_in_at, opted_out_at')
      .eq('user_id', userId)
      .eq('topic', SMS_TOPIC)
      .maybeSingle<SmsSubscriptionRow>(),
  ])

  if (destinationResult.error || subscriptionResult.error) return null

  const destinationRow = asSingleRow<SmsDestinationRow>(destinationResult.data)
  const subscriptionRow = asSingleRow<SmsSubscriptionRow>(subscriptionResult.data)
  const destination = destinationRow
    ? { phoneMasked: maskPhone(destinationRow.phone_e164), verifiedAt: destinationRow.verified_at }
    : null
  const subscription = subscriptionRow
    ? {
        consentedAt: subscriptionRow.consented_at,
        optedInAt: subscriptionRow.opted_in_at,
        optedOutAt: subscriptionRow.opted_out_at,
      }
    : null

  return {
    ...smsAvailability(),
    enabled: Boolean(destination && subscription?.optedInAt && !subscription.optedOutAt),
    destination,
    subscription,
  }
}

function unavailableResponse() {
  return NextResponse.json({ error: 'SMS notifications are not available on this deployment.' }, { status: 503 })
}

function invalidRequestResponse() {
  return NextResponse.json({ error: 'Enter a valid request and an E.164 mobile number.' }, { status: 400 })
}

type AuthenticatedRequest =
  | { ok: false; response: NextResponse }
  | { ok: true; user: { id: string; email?: string | null } }

async function authenticatedRequest(request: Request): Promise<AuthenticatedRequest> {
  const { user } = await resolveRequestAuth(request)
  if (!user) return { ok: false, response: NextResponse.json({ error: 'Not authenticated.' }, { status: 401 }) }
  return { ok: true, user }
}

/**
 * GET /api/account/sms
 *
 * Account-scoped read model for the settings card. The raw destination remains
 * service-role-only; this route returns a masked representation after it has
 * resolved the current session or bearer token.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const limited = await enforceRateLimit(request, 'account:sms:read', 30, 60_000)
  if (limited) return limited

  const auth = await authenticatedRequest(request)
  if (!auth.ok) return auth.response

  const userLimited = await enforceRateLimit(request, 'account:sms:read:user', 30, 60_000, { subject: auth.user.id })
  if (userLimited) return userLimited
  if (!hasSupabaseAdminEnv()) return unavailableResponse()

  const status = await loadSmsStatus(createAdminClient(), auth.user.id)
  if (!status) return NextResponse.json({ error: 'Could not load SMS notification settings.' }, { status: 500 })
  return NextResponse.json(status, { headers: { 'cache-control': 'no-store' } })
}

/**
 * POST /api/account/sms
 *
 * `start` only starts Twilio Verify after explicit consent; it writes neither a
 * destination nor a subscription. `verify` is the only path that can activate
 * a destination, and calls a single service-role SQL function only after Verify
 * confirms possession. `disable` remains available even if Twilio is down.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const limited = await enforceRateLimit(request, 'account:sms', 20, 60_000)
  if (limited) return limited

  const auth = await authenticatedRequest(request)
  if (!auth.ok) return auth.response

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return invalidRequestResponse()
  }
  const input = parseAction(rawBody)
  if (!input) return invalidRequestResponse()

  const actionRateLimit =
    input.action === 'start'
      ? { route: 'account:sms:start', limit: 3, windowMs: 10 * 60_000, failClosed: true }
      : input.action === 'verify'
        ? { route: 'account:sms:verify', limit: 8, windowMs: 10 * 60_000, failClosed: true }
        : { route: 'account:sms:disable', limit: 6, windowMs: 60_000, failClosed: false }
  const userLimited = await enforceRateLimit(request, actionRateLimit.route, actionRateLimit.limit, actionRateLimit.windowMs, {
    subject: auth.user.id,
    failClosed: actionRateLimit.failClosed,
  })
  if (userLimited) return userLimited
  if (!hasSupabaseAdminEnv()) return unavailableResponse()

  const admin = createAdminClient()

  if (input.action === 'start') {
    if (!isSmsRuntimeReady()) return unavailableResponse()
    const phoneSubject = smsPhoneRateLimitSubject(input.phone)
    if (!phoneSubject) return unavailableResponse()
    const phoneLimited = await enforceRateLimit(request, 'account:sms:start:phone', 3, 10 * 60_000, {
      subject: phoneSubject,
      failClosed: true,
      requireShared: true,
    })
    if (phoneLimited) return phoneLimited
    const verification = await startSmsPhoneVerification({ to: input.phone })
    if (!verification.ok) {
      return NextResponse.json({ error: 'Could not send a verification code. Please try again later.' }, { status: 502 })
    }
  }

  if (input.action === 'verify') {
    if (!isSmsRuntimeReady()) return unavailableResponse()
    const verification = await checkSmsPhoneVerification({ to: input.phone, code: input.code })
    if (!verification.ok) {
      return NextResponse.json({ error: 'Could not check that verification code. Please try again later.' }, { status: 502 })
    }
    if (!verification.approved) {
      return NextResponse.json({ error: 'That verification code was not accepted. Check it and try again.' }, { status: 400 })
    }

    const { error } = await admin.rpc('activate_user_sms_destination', {
      p_user_id: auth.user.id,
      p_phone_e164: input.phone,
      p_consent_version: SMS_CONSENT_VERSION,
      p_consented_at: new Date().toISOString(),
    })
    if (error) {
      // Do not expose a unique-constraint/database error: it can include an
      // account-owned number or provider context.
      return NextResponse.json({ error: 'Could not enable SMS notifications for this number.' }, { status: 409 })
    }
  }

  if (input.action === 'disable') {
    const now = new Date().toISOString()
    // Subscription first gives STOP-like behavior even if the subsequent
    // revocation write is temporarily unavailable.
    const { error: subscriptionError } = await admin
      .from('sms_subscriptions')
      .update({ opted_out_at: now })
      .eq('user_id', auth.user.id)
      .eq('topic', SMS_TOPIC)
      .is('opted_out_at', null)
    if (subscriptionError) {
      return NextResponse.json({ error: 'Could not turn off SMS notifications. Please try again.' }, { status: 503 })
    }

    if (!(await suppressPendingSmsNotifications({ userId: auth.user.id, admin, reason: 'opted_out' }))) {
      return NextResponse.json({ error: 'Could not turn off SMS notifications. Please try again.' }, { status: 503 })
    }

    const { error: destinationError } = await admin
      .from('user_sms_destinations')
      .update({ revoked_at: now })
      .eq('user_id', auth.user.id)
      .is('revoked_at', null)
    if (destinationError) {
      return NextResponse.json({ error: 'Could not turn off SMS notifications. Please try again.' }, { status: 503 })
    }
  }

  const status = await loadSmsStatus(admin, auth.user.id)
  if (!status) return NextResponse.json({ error: 'SMS notification settings were updated but could not be reloaded.' }, { status: 500 })
  return NextResponse.json(status, { headers: { 'cache-control': 'no-store' } })
}
