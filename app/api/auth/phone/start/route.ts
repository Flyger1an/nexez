import { createHmac } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { normalizeE164PhoneNumber } from '@/lib/phone-auth'
import { enforceRateLimit, hasSharedRateLimitBackend } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

const RATE_LIMIT_SECRET_MIN_LENGTH = 32

function phoneRateLimitSubject(phone: string): string | null {
  const secret = process.env.NEXEZ_SMS_RATE_LIMIT_SECRET?.trim()
  if (!secret || secret.length < RATE_LIMIT_SECRET_MIN_LENGTH) return null
  return createHmac('sha256', secret).update(`nexez:phone-login:${phone}`).digest('base64url')
}

function acceptedResponse() {
  // Always return the same response after a provider attempt. The caller must
  // not be able to distinguish an unlinked number from an SMS delivery issue.
  return NextResponse.json({ sent: true }, { status: 202, headers: { 'cache-control': 'no-store' } })
}

/**
 * Start existing-account phone login behind Nexez's shared IP and per-number
 * limits. Supabase still owns the OTP and session, while this boundary prevents
 * the normal UI from becoming an unmetered SMS trigger.
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
    return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 })
  }

  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 })
  }
  const input = rawBody as Record<string, unknown>
  if (Object.keys(input).some((key) => key !== 'phone')) {
    return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 })
  }
  const phone = typeof input.phone === 'string' ? normalizeE164PhoneNumber(input.phone) : null
  if (!phone) return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 })

  const phoneSubject = phoneRateLimitSubject(phone)
  if (!phoneSubject || !hasSharedRateLimitBackend()) {
    return NextResponse.json({ error: 'Phone sign-in is temporarily unavailable.' }, { status: 503 })
  }
  const phoneLimited = await enforceRateLimit(request, 'auth:phone:start:number', 3, 10 * 60_000, {
    subject: phoneSubject,
    failClosed: true,
    requireShared: true,
  })
  if (phoneLimited) return phoneLimited

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Phone sign-in is temporarily unavailable.' }, { status: 503 })
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: { channel: 'sms', shouldCreateUser: false },
    })
    if (error) console.warn('[phone-auth] Supabase OTP start was not accepted.', { code: error.code, status: error.status })
  } catch {
    console.warn('[phone-auth] Supabase OTP start failed before a provider response.')
  }

  return acceptedResponse()
}
