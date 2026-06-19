import { NextResponse, type NextRequest } from 'next/server'
import { authenticateNexieRequest } from '../../../../../lib/agents/nexie-auth'
import { ensureUserAgent } from '../../../../../lib/agents/nexie'
import { normalizePreferences } from '../../../../../lib/agents/nexie-preferences'
import { enforceRateLimit } from '../../../../../lib/rate-limit'

export const maxDuration = 30

/**
 * GET /api/agents/nexie/preferences — the authenticated buyer's standing preferences
 * (budget, interests, timing, location, voice-replies default). Always returns a complete,
 * normalized shape (defaults when nothing is set). Owner-scoped via RLS on user_agents.
 */
export async function GET(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:nexie:preferences', 30, 60_000)
  if (limited) return limited

  const auth = await authenticateNexieRequest(request)
  if (!auth.ok) return auth.response

  try {
    const agent = await ensureUserAgent(auth.db, auth.user.id)
    return NextResponse.json({ ok: true, preferences: normalizePreferences(agent.preferences) })
  } catch (error) {
    console.error('[Nexie] preferences load failed', error)
    return NextResponse.json({ error: 'Could not load your preferences.' }, { status: 500 })
  }
}

/**
 * PATCH /api/agents/nexie/preferences — replace the buyer's standing preferences with a
 * validated copy of the posted `{ preferences }` (the agent reads these every turn). The
 * body is fully normalized server-side, so the client can't store anything unsafe/oversized.
 */
export async function PATCH(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:nexie:preferences', 20, 60_000)
  if (limited) return limited

  const auth = await authenticateNexieRequest(request)
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
      .eq('name', 'Nexie')
    if (error) throw error
    return NextResponse.json({ ok: true, preferences })
  } catch (error) {
    console.error('[Nexie] preferences update failed', error)
    return NextResponse.json({ error: 'Could not save your preferences.' }, { status: 500 })
  }
}
