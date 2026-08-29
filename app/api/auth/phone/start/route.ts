import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { enforceRateLimit, hasSharedRateLimitBackend } from '@/lib/rate-limit'
import {
  createSmsLoginChallenge,
  isSmsLoginChallengeConfigured,
  smsLoginRateLimitSubject,
} from '@/lib/server/sms-login-challenge'
import { createAdminClient, hasSupabaseAdminEnv } from '@/utils/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

function normalizeLoginEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  return email.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null
}

function acceptedResponse(challenge: string) {
  // Existing and unknown emails receive the same response shape. The encrypted
  // challenge contains either a verified account binding or a dummy binding.
  return NextResponse.json({ sent: true, challenge }, { status: 202, headers: { 'cache-control': 'no-store' } })
}

/**
 * Resolve an existing account's verified phone from its email, then start SMS
 * login without returning the phone to the browser. Supabase still owns the OTP.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const limited = await enforceRateLimit(request, 'auth:phone:start:ip', 10, 10 * 60_000, {
    failClosed: true,
    requireShared: true,
  })
  if (limited) return limited

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }
  const input = rawBody as Record<string, unknown>
  if (Object.keys(input).some((key) => key !== 'email')) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }
  const email = normalizeLoginEmail(input.email)
  if (!email) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })

  const emailSubject = smsLoginRateLimitSubject('email', email)
  if (!emailSubject
    || !isSmsLoginChallengeConfigured()
    || !hasSharedRateLimitBackend()
    || !hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'Text sign-in is temporarily unavailable.' }, { status: 503 })
  }
  const emailLimited = await enforceRateLimit(request, 'auth:phone:start:email', 3, 10 * 60_000, {
    subject: emailSubject,
    failClosed: true,
    requireShared: true,
  })
  if (emailLimited) return emailLimited

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Text sign-in is temporarily unavailable.' }, { status: 503 })
  }

  const admin = createAdminClient()
  const { data: identifier, error: lookupError } = await admin
    .from('sms_login_identifiers')
    .select('user_id, phone_e164')
    .eq('email_normalized', email)
    .maybeSingle()
  if (lookupError) {
    console.warn('[phone-auth] Verified login identifier lookup failed.', { code: lookupError.code })
    return NextResponse.json({ error: 'Text sign-in is temporarily unavailable.' }, { status: 503 })
  }

  const account = identifier
    ? { userId: identifier.user_id as string, phone: identifier.phone_e164 as string }
    : null
  const challenge = createSmsLoginChallenge(account)
  if (!challenge) {
    return NextResponse.json({ error: 'Text sign-in is temporarily unavailable.' }, { status: 503 })
  }

  try {
    if (account) {
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      const { error } = await supabase.auth.signInWithOtp({
        phone: account.phone,
        options: { channel: 'sms', shouldCreateUser: false },
      })
      if (error) console.warn('[phone-auth] Supabase OTP start was not accepted.', { code: error.code, status: error.status })
    }
  } catch {
    console.warn('[phone-auth] Supabase OTP start failed before a provider response.')
  }

  return acceptedResponse(challenge)
}
