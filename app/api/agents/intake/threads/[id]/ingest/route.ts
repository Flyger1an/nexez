import { NextResponse, type NextRequest } from 'next/server'
import { importResultToExtraction, loadIntakeSession, sessionState } from '../../../../../../../lib/agents/intake'
import { analyzeSite, getImportUrlError, llmExtractOffers } from '../../../../../../../lib/importer'
import { applyIntakeAction, type IntakeExtraction, type IntakeState } from '../../../../../../../lib/intake'
import { captureEvent } from '../../../../../../../lib/observability'
import { enforceRateLimit } from '../../../../../../../lib/rate-limit'
import { resolveRequestAuth } from '../../../../../../../lib/server/request-auth'

// Ingestion crawls — keep the budget generous but bounded.
export const maxDuration = 60

/**
 * POST /api/agents/intake/threads/[id]/ingest — add a source mid-conversation
 * (spec §5). Body: { url? } | { text? }. Sources append; extraction folds into
 * the working draft non-destructively (stated facts always win) and gaps are
 * re-analyzed in place. Integration sources land in a later batch — the tool
 * schema stays forward-compatible.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(request, 'agents:intake:ingest', 6, 60_000)
  if (limited) return limited

  const { supabase, user } = await resolveRequestAuth(request)
  if (!user) return NextResponse.json({ error: 'Sign in to continue your interview.', code: 'auth_required' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const url = typeof body.url === 'string' ? body.url.trim() : ''
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!url && !text) {
    return NextResponse.json({ error: 'Provide a url or pasted text to ingest.' }, { status: 400 })
  }
  if (url) {
    const urlError = getImportUrlError(url)
    if (urlError) return NextResponse.json({ error: urlError }, { status: 400 })
  }

  const { id } = await params
  const row = await loadIntakeSession(supabase, id, user.id)
  if (!row) return NextResponse.json({ error: 'Interview not found.' }, { status: 404 })
  if (row.status !== 'active') {
    return NextResponse.json({ error: 'This interview has already handed off.', code: 'already_handed_off' }, { status: 409 })
  }

  let state: IntakeState = sessionState(row)
  const sourceId = crypto.randomUUID()
  const nowIso = new Date().toISOString()

  const added = applyIntakeAction(state, {
    type: 'ADD_SOURCE',
    source: url
      ? { id: sourceId, kind: 'url', value: url, label: url, addedAt: nowIso }
      : { id: sourceId, kind: 'text', value: text.slice(0, 20_000), label: 'Pasted text', addedAt: nowIso },
  })
  if (!added.ok) return NextResponse.json({ error: added.error, code: added.code }, { status: 400 })
  state = added.state

  let extraction: IntakeExtraction
  try {
    if (url) {
      extraction = importResultToExtraction(sourceId, await analyzeSite(url))
    } else {
      // Pasted text rides the importer's LLM offer extractor (best-effort — []
      // without a configured LLM; the interview simply asks instead).
      const offers = await llmExtractOffers(text)
      extraction = { sourceId, offers, clarifyingQuestions: null }
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not ingest that source.' },
      { status: 422 },
    )
  }

  const recorded = applyIntakeAction(state, { type: 'RECORD_EXTRACTION', extraction })
  if (!recorded.ok) return NextResponse.json({ error: recorded.error, code: recorded.code }, { status: 400 })
  state = recorded.state

  const { error } = await supabase
    .from('intake_sessions')
    .update({ state, phase: state.phase, updated_at: nowIso })
    .eq('id', row.id)
    .eq('owner_id', user.id)
  if (error) return NextResponse.json({ error: 'Could not save the new source.' }, { status: 500 })

  // Telemetry (spec §8): mid-conversation sources and what they yield.
  captureEvent('intake.ingest', {
    sessionId: row.id,
    kind: url ? 'url' : 'text',
    offersFound: extraction.offers.length,
    gaps: state.gaps.length,
  })

  return NextResponse.json({
    ok: true,
    sourceId,
    offersFound: extraction.offers.length,
    phase: state.phase,
    state,
  })
}
