import { NextResponse, type NextRequest } from 'next/server'
import { authenticateNexieRequest } from '../../../../../lib/agents/nexie-auth'
import { enforceRateLimit } from '../../../../../lib/rate-limit'

export const maxDuration = 30

/**
 * GET /api/agents/nexie/threads — the authenticated buyer's recent conversations
 * (ACTIVE only, newest first). Owner-scoped via RLS on agent_threads. Archived threads
 * are excluded (PATCH /threads/[id] { archived } toggles status).
 */
export async function GET(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:nexie:threads', 40, 60_000)
  if (limited) return limited

  const auth = await authenticateNexieRequest(request)
  if (!auth.ok) return auth.response

  try {
    const { data, error } = await auth.db
      .from('agent_threads')
      .select('id, title, updated_at')
      .eq('user_id', auth.user.id)
      .eq('status', 'ACTIVE')
      .order('updated_at', { ascending: false })
      .limit(50)
    if (error) throw error
    const threads = (data ?? []).map((t) => ({ id: t.id, title: t.title, updatedAt: t.updated_at }))
    return NextResponse.json({ ok: true, threads })
  } catch (error) {
    console.error('[Nexie] threads list failed', error)
    return NextResponse.json({ error: 'Could not load your conversations.' }, { status: 500 })
  }
}
