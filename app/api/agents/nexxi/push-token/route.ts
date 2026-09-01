import { NextResponse, type NextRequest } from 'next/server'
import { authenticateNexxiRequest } from '../../../../../lib/agents/nexxi-auth'
import { registerPushToken, type PushPlatform } from '../../../../../lib/push'
import { enforceRateLimit } from '../../../../../lib/rate-limit'

export const maxDuration = 20

const PLATFORMS = ['ios', 'android', 'web', 'unknown'] as const

/**
 * POST /api/agents/nexxi/push-token - register the device's Expo push token for the
 * authenticated buyer. Upserts via the user-scoped client (RLS confines it to the
 * caller's own rows); stores the account email too so async senders can resolve a
 * buyer by email (negotiations) or user id (orders).
 */
export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:nexxi:push-token', 20, 60_000)
  if (limited) return limited

  const auth = await authenticateNexxiRequest(request)
  if (!auth.ok) return auth.response

  let body: { token?: unknown; platform?: unknown; deviceName?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (!token) return NextResponse.json({ error: 'Push token is required.' }, { status: 400 })

  const platform: PushPlatform = (PLATFORMS as readonly string[]).includes(body.platform as string)
    ? (body.platform as PushPlatform)
    : 'unknown'
  const deviceName = typeof body.deviceName === 'string' ? body.deviceName.slice(0, 120) : null

  const result = await registerPushToken(auth.db, {
    userId: auth.user.id,
    email: auth.user.email ?? null,
    token,
    platform,
    deviceName,
  })

  if (!result.ok) {
    return NextResponse.json({ error: 'Could not save the push token.', detail: result.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
