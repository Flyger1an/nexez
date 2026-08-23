import { NextResponse, type NextRequest } from 'next/server'
import { handleIntakeTurn } from '../../../../../../../lib/agents/intake'
import { analyzeSite } from '../../../../../../../lib/importer'
import type { GapAnswer } from '../../../../../../../lib/intake'
import { enforceRateLimit } from '../../../../../../../lib/rate-limit'
import { ownerAllows } from '../../../../../../../lib/server/plan'
import { resolveRequestAuth } from '../../../../../../../lib/server/request-auth'

// A turn may include an LLM round-trip and (via the ingest_url tool) a crawl.
export const maxDuration = 60

/**
 * POST /api/agents/intake/threads/[id]/messages - one interview turn (spec §5):
 * owner turn in → agent turn out (text + cards). Body:
 *   { content?: string, answers?: GapAnswer[] }
 * `answers` are structured quick-answers from a gap_batch card - they apply
 * through the reducer directly (no LLM interpretation), which also keeps the
 * interview functional when no LLM is configured.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(request, 'agents:intake:messages', 20, 60_000)
  if (limited) return limited

  const { supabase, user } = await resolveRequestAuth(request)
  if (!user) return NextResponse.json({ error: 'Sign in to continue your interview.', code: 'auth_required' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const content = typeof body.content === 'string' ? body.content : undefined
  const answers = Array.isArray(body.answers) ? (body.answers as GapAnswer[]) : undefined
  if (!content?.trim() && !answers?.length) {
    return NextResponse.json({ error: 'Send a message or structured answers.' }, { status: 400 })
  }

  const { id } = await params
  const [aiAllowed, negotiationAllowed] = await Promise.all([
    ownerAllows(supabase, user.id, 'aiFeatures'),
    ownerAllows(supabase, user.id, 'negotiation'),
  ])
  const result = await handleIntakeTurn(
    { db: supabase, user, sessionId: id, content, structuredAnswers: answers, negotiationAllowed },
    {
      // Explicit null is the fail-closed signal: a configured deployment model
      // must not turn a Free seller's deterministic interview into paid AI.
      llm: aiAllowed ? undefined : null,
      importSite: (url) => analyzeSite(url, null, { skipLlm: !aiAllowed }),
    },
  )
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
  }
  return NextResponse.json({
    ok: true,
    message: result.message,
    cards: result.cards,
    phase: result.state.phase,
    state: result.state,
  })
}
