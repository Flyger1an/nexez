import { NextResponse } from 'next/server'
import { enforceRateLimit } from '@/lib/rate-limit'
import { resolveRequestAuth } from '@/lib/server/request-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 10

const SESSION_HEADERS = {
  'cache-control': 'no-store',
  vary: 'Cookie, Authorization',
  'x-content-type-options': 'nosniff',
}

/**
 * Minimal readiness probe for clients that have just established a session.
 * It intentionally returns no user identity or account data.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const limited = await enforceRateLimit(request, 'auth:session-readiness', 120, 60_000)
  if (limited) return limited

  const { user } = await resolveRequestAuth(request)
  if (!user) {
    return NextResponse.json(
      { authenticated: false },
      { status: 401, headers: SESSION_HEADERS },
    )
  }

  return new NextResponse(null, { status: 204, headers: SESSION_HEADERS })
}
