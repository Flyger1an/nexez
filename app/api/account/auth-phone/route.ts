import { createHmac } from 'crypto'
import { NextResponse } from 'next/server'
import { enforceRateLimit, hasSharedRateLimitBackend } from '@/lib/rate-limit'
import {
  maskE164PhoneNumber,
  normalizeE164PhoneNumber,
  normalizePhoneOtp,
  normalizeSupabaseAuthPhoneNumber,
} from '@/lib/phone-auth'
import { resolveRequestAuth } from '@/lib/server/request-auth'
import {
  checkSmsPhoneVerification,
  getTwilioConfigurationStatus,
  startSmsPhoneVerification,
} from '@/lib/server/sms'
import { createAdminClient, hasSupabaseAdminEnv } from '@/utils/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const RATE_LIMIT_SECRET_MIN_LENGTH = 32

type AuthPhoneAction =
  | { action: 'start'; phone: string }
  | { action: 'verify'; phone: string; code: string }

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key))
}

function parseAction(value: unknown): AuthPhoneAction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>

  if (input.action === 'start' && hasOnlyKeys(input, ['action', 'phone'])) {
    const phone = typeof input.phone === 'string' ? normalizeE164PhoneNumber(input.phone) : null
    return phone ? { action: 'start', phone } : null
  }

  if (input.action === 'verify' && hasOnlyKeys(input, ['action', 'phone', 'code'])) {
    const phone = typeof input.phone === 'string' ? normalizeE164PhoneNumber(input.phone) : null
    const code = typeof input.code === 'string' ? normalizePhoneOtp(input.code) : null
    return phone && code ? { action: 'verify', phone, code } : null
  }

  return null
}

function verificationRuntimeReady(): boolean {
  const configuration = getTwilioConfigurationStatus()
  return Boolean(
    hasSupabaseAdminEnv()
      && configuration.apiCredentialsConfigured
      && configuration.verifyConfigured
      && hasSharedRateLimitBackend()
      && (process.env.NEXEZ_SMS_RATE_LIMIT_SECRET?.trim().length ?? 0) >= RATE_LIMIT_SECRET_MIN_LENGTH,
  )
}

function phoneRateLimitSubject(phone: string): string | null {
  const secret = process.env.NEXEZ_SMS_RATE_LIMIT_SECRET?.trim()
  if (!secret || secret.length < RATE_LIMIT_SECRET_MIN_LENGTH) return null
  return createHmac('sha256', secret).update(`nexez:auth-phone:verify:${phone}`).digest('base64url')
}

function unavailableResponse() {
  return NextResponse.json({ error: 'Phone sign-in setup is not available on this deployment.' }, { status: 503 })
}

function genericLinkError(status = 400) {
  return NextResponse.json({ error: 'We could not verify and link that phone number.' }, { status })
}

function genericStatusError(status = 500) {
  return NextResponse.json({ error: 'We could not load login phone status.' }, { status })
}

/**
 * Return only the current account's masked, confirmed login phone. Reading the
 * Auth user through the admin API avoids stale phone claims in an existing
 * session after a server-side link, while never exposing the full number.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const limited = await enforceRateLimit(request, 'account:auth-phone:read', 60, 60_000)
  if (limited) return limited

  const { user } = await resolveRequestAuth(request)
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  if (!hasSupabaseAdminEnv()) return unavailableResponse()

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.getUserById(user.id)
  if (error || !data.user) return genericStatusError(502)

  const phone = data.user.phone_confirmed_at
    ? normalizeSupabaseAuthPhoneNumber(data.user.phone)
    : null

  return NextResponse.json(
    { phoneMasked: phone ? maskE164PhoneNumber(phone) : null },
    { headers: { 'cache-control': 'no-store' } },
  )
}

/**
 * Link a login phone only after the current account proves possession through
 * Nexez's Twilio Verify service. The service-role update avoids Supabase's
 * ambiguous pending phone-change lookup and relies on auth.users phone
 * uniqueness as the final account-conflict guard.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const limited = await enforceRateLimit(request, 'account:auth-phone', 20, 60_000)
  if (limited) return limited

  const { user } = await resolveRequestAuth(request)
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return genericLinkError()
  }

  const input = parseAction(rawBody)
  if (!input) return genericLinkError()
  if (!verificationRuntimeReady()) return unavailableResponse()

  const userLimited = await enforceRateLimit(
    request,
    input.action === 'start' ? 'account:auth-phone:start:user' : 'account:auth-phone:verify:user',
    input.action === 'start' ? 3 : 8,
    10 * 60_000,
    { subject: user.id, failClosed: true },
  )
  if (userLimited) return userLimited

  if (input.action === 'start') {
    const phoneSubject = phoneRateLimitSubject(input.phone)
    if (!phoneSubject) return unavailableResponse()
    const phoneLimited = await enforceRateLimit(request, 'account:auth-phone:start:phone', 3, 10 * 60_000, {
      subject: phoneSubject,
      failClosed: true,
      requireShared: true,
    })
    if (phoneLimited) return phoneLimited

    const verification = await startSmsPhoneVerification({ to: input.phone })
    if (!verification.ok) return genericLinkError(502)

    return NextResponse.json(
      { sent: true, phoneMasked: maskE164PhoneNumber(input.phone) },
      { headers: { 'cache-control': 'no-store' } },
    )
  }

  const verification = await checkSmsPhoneVerification({ to: input.phone, code: input.code })
  if (!verification.ok) return genericLinkError(502)
  if (!verification.approved) return genericLinkError()

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    phone: input.phone,
    phone_confirm: true,
  })
  if (error) {
    // Keep uniqueness and provider details private. A number already linked to
    // another account must look the same as any other failed link attempt.
    return genericLinkError(409)
  }

  return NextResponse.json(
    { verified: true, phoneMasked: maskE164PhoneNumber(input.phone) },
    { headers: { 'cache-control': 'no-store' } },
  )
}
