import { NextResponse, type NextRequest } from 'next/server'
import { loadIntakeSession, sessionState } from '../../../../../../lib/agents/intake'
import { enforceRateLimit } from '../../../../../../lib/rate-limit'
import { resolveRequestAuth } from '../../../../../../lib/server/request-auth'

export const maxDuration = 30

/**
 * GET /api/agents/intake/threads/[id] — resume: the full session state for any
 * client (web /create panel or the mobile onboarding screen render from the
 * same payload; spec §5). Owner-scoped via RLS + explicit owner eq.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(request, 'agents:intake:get', 60, 60_000)
  if (limited) return limited

  const { supabase, user } = await resolveRequestAuth(request)
  if (!user) return NextResponse.json({ error: 'Sign in to resume your interview.', code: 'auth_required' }, { status: 401 })

  const { id } = await params
  const row = await loadIntakeSession(supabase, id, user.id)
  if (!row) return NextResponse.json({ error: 'Interview not found.' }, { status: 404 })

  return NextResponse.json({
    ok: true,
    id: row.id,
    status: row.status,
    phase: row.phase,
    pageId: row.page_id,
    state: sessionState(row),
    updatedAt: row.updated_at,
  })
}
