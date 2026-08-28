import 'server-only'
import twilio from 'twilio'
import { isE164PhoneNumber, normalizeE164PhoneNumber } from '../phone-auth'

export { isE164PhoneNumber, normalizeE164PhoneNumber } from '../phone-auth'

// Twilio is intentionally isolated behind this server-only module. The browser
// never sees a Twilio credential, a phone number, or a verification code. Routes
// can mock this module as a single boundary, while the SDK details remain here.

const VERIFY_CODE = /^[A-Za-z0-9]{4,10}$/
const SMS_EVENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SID_PATTERNS = {
  account: /^AC[a-f0-9]{32}$/i,
  apiKey: /^SK[a-f0-9]{32}$/i,
  messagingService: /^MG[a-f0-9]{32}$/i,
  verifyService: /^VA[a-f0-9]{32}$/i,
} as const

const DEFAULT_APP_ORIGIN = 'https://app.nexez.ai'
const DEFAULT_AGENT_RUNTIME_ORIGIN = 'https://nexez.app'
const LEGACY_WEBHOOK_OVERRIDE_NAMES = [
  'TWILIO_WEBHOOK_BASE_URL',
  'TWILIO_STATUS_CALLBACK_URL',
  'TWILIO_INBOUND_WEBHOOK_URL',
] as const
const WEBHOOK_PATHS = {
  inbound: '/api/webhooks/twilio/inbound',
  status: '/api/webhooks/twilio/status',
} as const

export type TwilioWebhookKind = keyof typeof WEBHOOK_PATHS

/** A deliberately small interface lets route tests substitute a Twilio client without a network call. */
export type TwilioSmsClient = {
  messages: {
    create: (input: {
      to: string
      body: string
      messagingServiceSid: string
      statusCallback: string
      validityPeriod: number
    }) => Promise<{ sid: string; status?: string | null }>
  }
  verify: {
    v2: {
      services: (serviceSid: string) => {
        verifications: {
          create: (input: { to: string; channel: 'sms' }) => Promise<{ sid: string; status: string }>
        }
        verificationChecks: {
          create: (input: { to: string; code: string }) => Promise<{ sid: string; status: string; valid: boolean }>
        }
      }
    }
  }
}

export type TwilioConfigurationStatus = {
  apiCredentialsConfigured: boolean
  messagingConfigured: boolean
  verifyConfigured: boolean
  webhookValidationConfigured: boolean
  statusCallbackConfigured: boolean
  inboundWebhookConfigured: boolean
}

type TwilioApiCredentials = {
  accountSid: string
  apiKeySid: string
  apiKeySecret: string
}

type MessagingConfiguration = TwilioApiCredentials & {
  messagingServiceSid: string
}

type VerifyConfiguration = TwilioApiCredentials & {
  verifyServiceSid: string
}

export type SendSellerNegotiationSmsResult =
  | { ok: true; messageSid: string; status: string | null }
  | { ok: false; skipped?: boolean; errorCode: string }

export type StartSmsPhoneVerificationResult =
  | { ok: true; verificationSid: string; status: string }
  | { ok: false; skipped?: boolean; errorCode: string }

export type CheckSmsPhoneVerificationResult =
  | { ok: true; approved: boolean; verificationSid: string; status: string }
  | { ok: false; skipped?: boolean; errorCode: string }

function envValue(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = env[name]?.trim()
  return value || null
}

function isSid(value: string | null, pattern: RegExp): value is string {
  return Boolean(value && pattern.test(value))
}

function getApiCredentials(env: NodeJS.ProcessEnv): TwilioApiCredentials | null {
  const accountSid = envValue(env, 'TWILIO_ACCOUNT_SID')
  const apiKeySid = envValue(env, 'TWILIO_API_KEY_SID')
  const apiKeySecret = envValue(env, 'TWILIO_API_KEY_SECRET')
  if (!isSid(accountSid, SID_PATTERNS.account) || !isSid(apiKeySid, SID_PATTERNS.apiKey) || !apiKeySecret) return null
  return { accountSid, apiKeySid, apiKeySecret }
}

function getMessagingConfiguration(env: NodeJS.ProcessEnv): MessagingConfiguration | null {
  const credentials = getApiCredentials(env)
  const messagingServiceSid = envValue(env, 'TWILIO_MESSAGING_SERVICE_SID')
  if (!credentials || !isSid(messagingServiceSid, SID_PATTERNS.messagingService)) return null
  return { ...credentials, messagingServiceSid }
}

function getVerifyConfiguration(env: NodeJS.ProcessEnv): VerifyConfiguration | null {
  const credentials = getApiCredentials(env)
  const verifyServiceSid = envValue(env, 'TWILIO_VERIFY_SERVICE_SID')
  if (!credentials || !isSid(verifyServiceSid, SID_PATTERNS.verifyService)) return null
  return { ...credentials, verifyServiceSid }
}

function httpsOrigin(value: string | null, fallback: string): string | null {
  const raw = value ?? fallback
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) return null
    return parsed.origin
  } catch {
    return null
  }
}

/**
 * Twilio must call the production agent-runtime host directly. A callback to
 * app.nexez.ai, nexez.ai, www, a preview, or a custom domain is redirected by
 * the host proxy and breaks exact webhook-signature validation. Keep this
 * deliberately independent of arbitrary callback override variables.
 */
function canonicalTwilioWebhookOrigin(env: NodeJS.ProcessEnv): string | null {
  const value = envValue(env, 'NEXT_PUBLIC_AGENT_RUNTIME_URL') ?? envValue(env, 'NEXT_PUBLIC_SITE_URL') ?? DEFAULT_AGENT_RUNTIME_ORIGIN
  try {
    const parsed = new URL(value)
    if (
      parsed.origin !== DEFAULT_AGENT_RUNTIME_ORIGIN ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash ||
      parsed.username ||
      parsed.password
    ) {
      return null
    }
    return DEFAULT_AGENT_RUNTIME_ORIGIN
  } catch {
    return null
  }
}

function hasWebhookOverride(env: NodeJS.ProcessEnv): boolean {
  return LEGACY_WEBHOOK_OVERRIDE_NAMES.some((name) => envValue(env, name) !== null)
}

/** Canonical UUID emitted by the database for a durable SMS outbox event. */
export function normalizeSmsNotificationEventId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return SMS_EVENT_ID.test(normalized) ? normalized : null
}

/** The logged-in seller dashboard destination. It is not an approval or magic-action URL. */
export function getSellerNegotiationsDashboardUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const origin = httpsOrigin(envValue(env, 'NEXT_PUBLIC_APP_URL'), DEFAULT_APP_ORIGIN)
  return origin ? new URL('/dashboard/negotiations', origin).toString() : null
}

/**
 * Return the exact public webhook URL that must also be configured in Twilio.
 * An explicit override must name the expected path and cannot carry query-string secrets.
 */
export function getTwilioWebhookUrl(
  kind: TwilioWebhookKind,
  env: NodeJS.ProcessEnv = process.env,
  statusEventId?: string,
): string | null {
  // Fail closed if a legacy override remains in an environment. Silently
  // accepting a custom HTTPS URL would let Twilio hit a 308/wrong-origin route
  // and invalidate the signature assumption below.
  if (hasWebhookOverride(env)) return null
  const path = WEBHOOK_PATHS[kind]
  const origin = canonicalTwilioWebhookOrigin(env)
  const baseUrl = origin ? new URL(path, origin).toString() : null
  if (!baseUrl || kind !== 'status' || statusEventId === undefined) return baseUrl

  const eventId = normalizeSmsNotificationEventId(statusEventId)
  if (!eventId) return null
  const callback = new URL(baseUrl)
  // This ID is not an authorization secret. Twilio signs the full callback URL,
  // including the event parameter, before the webhook can mutate the outbox.
  callback.searchParams.set('event', eventId)
  return callback.toString()
}

export function getTwilioStatusCallbackUrl(env: NodeJS.ProcessEnv = process.env, eventId?: string): string | null {
  return getTwilioWebhookUrl('status', env, eventId)
}

/** Configuration-only signal for UI/routes; values and secrets are never returned. */
export function getTwilioConfigurationStatus(env: NodeJS.ProcessEnv = process.env): TwilioConfigurationStatus {
  return {
    apiCredentialsConfigured: getApiCredentials(env) !== null,
    messagingConfigured: getMessagingConfiguration(env) !== null,
    verifyConfigured: getVerifyConfiguration(env) !== null,
    webhookValidationConfigured: Boolean(envValue(env, 'TWILIO_AUTH_TOKEN')),
    statusCallbackConfigured: getTwilioWebhookUrl('status', env) !== null,
    inboundWebhookConfigured: getTwilioWebhookUrl('inbound', env) !== null,
  }
}

export function hasTwilioMessagingEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return getMessagingConfiguration(env) !== null
}

/** Service identity used to reject inbound messages from another Twilio sender. */
export function getTwilioMessagingServiceSid(env: NodeJS.ProcessEnv = process.env): string | null {
  return getMessagingConfiguration(env)?.messagingServiceSid ?? null
}

/**
 * Sending is enabled only when delivery callbacks and STOP handling can be
 * authenticated. A Messaging Service credential by itself is not enough:
 * Nexez must be able to track a message and honor an opt-out safely.
 */
export function isTwilioMessagingDeliveryReady(env: NodeJS.ProcessEnv = process.env): boolean {
  const status = getTwilioConfigurationStatus(env)
  return (
    status.messagingConfigured &&
    status.webhookValidationConfigured &&
    status.statusCallbackConfigured &&
    status.inboundWebhookConfigured
  )
}

export function hasTwilioVerifyEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return getVerifyConfiguration(env) !== null
}

// Aliases keep call sites readable when an endpoint is simply gating a feature.
export const isTwilioMessagingConfigured = hasTwilioMessagingEnv
export const isTwilioVerifyConfigured = hasTwilioVerifyEnv

/**
 * Build an API-key authenticated SDK client. TWILIO_AUTH_TOKEN is deliberately
 * absent here: it is reserved exclusively for webhook signature validation.
 */
export function createTwilioClient(env: NodeJS.ProcessEnv = process.env): TwilioSmsClient | null {
  const credentials = getApiCredentials(env)
  if (!credentials) return null
  return twilio(credentials.apiKeySid, credentials.apiKeySecret, { accountSid: credentials.accountSid }) as unknown as TwilioSmsClient
}

/** Generic, low-detail seller alert body. Do not add offer, buyer, price, or approval data here. */
export function buildSellerNegotiationSmsBody(env: NodeJS.ProcessEnv = process.env): string | null {
  const dashboardUrl = getSellerNegotiationsDashboardUrl(env)
  if (!dashboardUrl) return null
  return `Nexez: A new negotiation needs review. Sign in to your dashboard: ${dashboardUrl} Reply STOP to opt out.`
}

function providerErrorCode(error: unknown, fallback: string): string {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : null
  return typeof code === 'number' || (typeof code === 'string' && /^\d{3,6}$/.test(code)) ? `twilio_${code}` : fallback
}

/**
 * Deliver a deliberately generic seller notification using a Messaging Service.
 * This is notification-only: the URL requires ordinary Nexez sign-in and cannot
 * approve, accept, or execute anything by itself.
 */
async function sendTransactionalSms(input: {
  to: string
  eventId: string
  body: string | null
  env?: NodeJS.ProcessEnv
  client?: TwilioSmsClient | null
}): Promise<SendSellerNegotiationSmsResult> {
  const env = input.env ?? process.env
  const to = normalizeE164PhoneNumber(input.to)
  const eventId = normalizeSmsNotificationEventId(input.eventId)
  if (!to) return { ok: false, errorCode: 'invalid_phone_number' }
  if (!eventId) return { ok: false, errorCode: 'invalid_event' }

  const messaging = getMessagingConfiguration(env)
  const statusCallback = getTwilioStatusCallbackUrl(env, eventId)
  const client = input.client === undefined ? createTwilioClient(env) : input.client
  if (!messaging || !statusCallback || !input.body || !client) return { ok: false, skipped: true, errorCode: 'not_configured' }

  try {
    const message = await client.messages.create({
      to,
      body: input.body,
      messagingServiceSid: messaging.messagingServiceSid,
      statusCallback,
      // Negotiation review alerts are time-sensitive; do not allow stale SMS to arrive days later.
      validityPeriod: 300,
    })
    return { ok: true, messageSid: message.sid, status: message.status ?? null }
  } catch (error) {
    // Never surface provider message bodies, recipient data, or SDK error text.
    return { ok: false, errorCode: providerErrorCode(error, 'send_failed') }
  }
}

export async function sendSellerNegotiationSms(input: {
  to: string
  eventId: string
  env?: NodeJS.ProcessEnv
  client?: TwilioSmsClient | null
}): Promise<SendSellerNegotiationSmsResult> {
  return sendTransactionalSms({ ...input, body: buildSellerNegotiationSmsBody(input.env) })
}

/** Send Twilio Verify's SMS challenge after the account route has recorded consent and applied rate limits. */
export async function startSmsPhoneVerification(input: {
  to: string
  env?: NodeJS.ProcessEnv
  client?: TwilioSmsClient | null
}): Promise<StartSmsPhoneVerificationResult> {
  const env = input.env ?? process.env
  const to = normalizeE164PhoneNumber(input.to)
  if (!to) return { ok: false, errorCode: 'invalid_phone_number' }

  const verify = getVerifyConfiguration(env)
  const client = input.client === undefined ? createTwilioClient(env) : input.client
  if (!verify || !client) return { ok: false, skipped: true, errorCode: 'not_configured' }

  try {
    const result = await client.verify.v2.services(verify.verifyServiceSid).verifications.create({ to, channel: 'sms' })
    return result.status === 'pending'
      ? { ok: true, verificationSid: result.sid, status: result.status }
      : { ok: false, errorCode: 'verification_not_pending' }
  } catch (error) {
    return { ok: false, errorCode: providerErrorCode(error, 'verification_start_failed') }
  }
}

/** Check a Verify challenge. A caller must persist `approved` before treating a phone as verified. */
export async function checkSmsPhoneVerification(input: {
  to: string
  code: string
  env?: NodeJS.ProcessEnv
  client?: TwilioSmsClient | null
}): Promise<CheckSmsPhoneVerificationResult> {
  const env = input.env ?? process.env
  const to = normalizeE164PhoneNumber(input.to)
  const code = input.code.trim()
  if (!to) return { ok: false, errorCode: 'invalid_phone_number' }
  if (!VERIFY_CODE.test(code)) return { ok: false, errorCode: 'invalid_verification_code' }

  const verify = getVerifyConfiguration(env)
  const client = input.client === undefined ? createTwilioClient(env) : input.client
  if (!verify || !client) return { ok: false, skipped: true, errorCode: 'not_configured' }

  try {
    const result = await client.verify.v2.services(verify.verifyServiceSid).verificationChecks.create({ to, code })
    return {
      ok: true,
      approved: result.status === 'approved' && result.valid !== false,
      verificationSid: result.sid,
      status: result.status,
    }
  } catch (error) {
    return { ok: false, errorCode: providerErrorCode(error, 'verification_check_failed') }
  }
}

/**
 * Validate a Twilio form webhook against the exact public URL configured above.
 * Callers must pass the unmodified form fields (for example Object.fromEntries(formData)).
 */
export function validateTwilioWebhookSignature(input: {
  kind: TwilioWebhookKind
  signature: string | null | undefined
  params: Record<string, string>
  statusEventId?: string
  env?: NodeJS.ProcessEnv
}): boolean {
  const env = input.env ?? process.env
  const authToken = envValue(env, 'TWILIO_AUTH_TOKEN')
  const url = getTwilioWebhookUrl(input.kind, env, input.statusEventId)
  if (!authToken || !input.signature || !url) return false
  try {
    return twilio.validateRequest(authToken, input.signature, url, input.params)
  } catch {
    return false
  }
}
