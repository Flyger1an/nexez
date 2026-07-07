import { NextResponse, type NextRequest } from 'next/server'
import { commitIntakeSession } from '../../../../../../../lib/agents/intake'
import { enforceRateLimit } from '../../../../../../../lib/rate-limit'
import { resolveRequestAuth } from '../../../../../../../lib/server/request-auth'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../../../../utils/supabase/admin'

export const maxDuration = 30

/**
 * POST /api/agents/intake/threads/[id]/commit - REVIEW_HANDOFF (spec §5):
 * materialize the working draft through the existing paths and return the page
 * id. A new listing is created as a DRAFT (publishing stays a human decision in
 * the builder); a re-interview stages onto pages.draft. Owner-initiated commit
 * is always allowed - it doubles as the "just take me to the form" exit.
 * Idempotent: retrying a committed session returns the same page id.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(request, 'agents:intake:commit', 10, 60_000)
  if (limited) return limited

  const { supabase, user } = await resolveRequestAuth(request)
  if (!user) return NextResponse.json({ error: 'Sign in to finish your interview.', code: 'auth_required' }, { status: 401 })
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'Listing creation is unavailable right now.' }, { status: 503 })
  }

  const { id } = await params
  const result = await commitIntakeSession({ db: supabase, admin: createAdminClient(), user, sessionId: id })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({
    ok: true,
    pageId: result.pageId,
    slug: result.slug,
    alreadyCommitted: result.alreadyCommitted,
    builderPath: `/dashboard/${result.pageId}`,
  })
}
