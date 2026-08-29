import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { normalizePhoneOtp } from '@/lib/phone-auth'
import { enforceRateLimit, hasSharedRateLimitBackend } from '@/lib/rate-limit'
import {
  isSmsLoginChallengeConfigured,
  readSmsLoginChallenge,
  smsLoginRateLimitSubject,
} from '@/lib/server/sms-login-challenge'
import { createClient } from '@/utils/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

function verificationError() {
  return NextResponse.json(
    { error: 'That code could not be verified. Check the code and try again.' },
    { status: 400, headers: { 'cache-control': 'no-store' } },
  )
}

export async function POST(request: Request): Promise<NextResponse> {
  const limited = await enforceRateLimit(request, 'auth:phone:verify:ip', 20, 10 * 60_000, {
    failClosed: true,
    requireShared: true,
  })
  if (limited) return limited

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return verificationError()
  }
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) return verificationError()

  const input = rawBody as Record<string, unknown>
  if (Object.keys(input).length !== 2 || Object.keys(input).some((key) => !['challenge', 'code'].includes(key))) {
    return verificationError()
  }
  const challengeToken = typeof input.challenge === 'string' ? input.challenge : ''
  const code = typeof input.code === 'string' ? normalizePhoneOtp(input.code) : null
  if (!challengeToken || !code) return verificationError()

  const challengeSubject = smsLoginRateLimitSubject('challenge', challengeToken)
  if (!challengeSubject || !isSmsLoginChallengeConfigured() || !hasSharedRateLimitBackend()) {
    return NextResponse.json({ error: 'Text sign-in is temporarily unavailable.' }, { status: 503 })
  }
  const challengeLimited = await enforceRateLimit(request, 'auth:phone:verify:challenge', 8, 10 * 60_000, {
    subject: challengeSubject,
    failClosed: true,
    requireShared: true,
  })
  if (challengeLimited) return challengeLimited

  const challenge = readSmsLoginChallenge(challengeToken)
  if (!challenge?.userId || !challenge.phone) return verificationError()

  const requestUrl = new URL(request.url)
  const supabase = createClient(await cookies(), requestUrl.host)
  const { data, error } = await supabase.auth.verifyOtp({
    phone: challenge.phone,
    token: code,
    type: 'sms',
  })
  if (error || data.user?.id !== challenge.userId) {
    if (data.session) await supabase.auth.signOut()
    return verificationError()
  }

  return NextResponse.json(
    { verified: true },
    { headers: { 'cache-control': 'no-store' } },
  )
}
