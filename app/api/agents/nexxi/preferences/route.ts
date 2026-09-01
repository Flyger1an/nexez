import { NextResponse, type NextRequest } from 'next/server'
import { authenticateNexxiRequest } from '../../../../../lib/agents/nexxi-auth'
import { ensureUserAgent } from '../../../../../lib/agents/nexxi'
import { normalizePreferences } from '../../../../../lib/agents/nexxi-preferences'
import { getAvailableSources } from '../../../../../lib/agents/source-adapters'
import { enforceRateLimit } from '../../../../../lib/rate-limit'

export const maxDuration = 30

/**
 * GET /api/agents/nexxi/preferences - the authenticated buyer's standing preferences
 * (budget, interests, timing, location, voice-replies default). Always returns a complete,
 * normalized shape (defaults when nothing is set). Owner-scoped via RLS on user_agents.
 */
export async function GET(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:nexxi:preferences', 30, 60_000)
  if (limited) return limited

  const auth = await authenticateNexxiRequest(request)
  if (!auth.ok) return auth.response

  try {
    const agent = await ensureUserAgent(auth.db, auth.user.id)
    // availableSources lets the app render only the sources that are actually configured (the
    // core Nexez source is always present; external ones appear once their API key is set).
    return NextResponse.json({
      ok: true,
      preferences: normalizePreferences(agent.preferences),
      availableSources: getAvailableSources(),
    })
  } catch (error) {
    console.error('[Nexxi] preferences load failed', error)
    return NextResponse.json({ error: 'Could not load your preferences.' }, { status: 500 })
  }
}

/**
 * PATCH /api/agents/nexxi/preferences - replace the buyer's standing preferences with a
 * validated copy of the posted `{ preferences }` (the agent reads these every turn). The
 * body is fully normalized server-side, so the client can't store anything unsafe/oversized.
 */
export async function PATCH(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:nexxi:preferences', 20, 60_000)
  if (limited) return limited

  const auth = await authenticateNexxiRequest(request)
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const incoming = body && typeof body === 'object' && 'preferences' in body ? (body as { preferences: unknown }).preferences : body
  const preferences = normalizePreferences(incoming)

  try {
    // Make sure the singleton agent row exists (first-timers may set prefs before chatting),
    // then persist under RLS as the owner.
    await ensureUserAgent(auth.db, auth.user.id)
    const { error } = await auth.db
      .from('user_agents')
      .update({ preferences })
      .eq('user_id', auth.user.id)
      .eq('name', 'Nexxi')
    if (error) throw error
    return NextResponse.json({ ok: true, preferences })
  } catch (error) {
    console.error('[Nexxi] preferences update failed', error)
    return NextResponse.json({ error: 'Could not save your preferences.' }, { status: 500 })
  }
}
