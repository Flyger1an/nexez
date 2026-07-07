import { NextResponse, type NextRequest } from 'next/server'
import {
  importResultToExtraction,
  initialAnalyzedState,
} from '../../../../../lib/agents/intake'
import { OWNER_PAGE_SELECT, type AgentPage } from '../../../../../lib/agent-page'
import { analyzeSite, getImportUrlError } from '../../../../../lib/importer'
import { applyIntakeAction, createIntakeState, type IntakeState } from '../../../../../lib/intake'
import { enforceRateLimit } from '../../../../../lib/rate-limit'
import { resolveRequestAuth } from '../../../../../lib/server/request-auth'

// Creating a session may crawl the seller's site inline (same UX budget as the
// existing /create importer path).
export const maxDuration = 60

/**
 * POST /api/agents/intake/threads — start an intake interview (spec §5).
 * Body: { source_url?, page_id? }. With a page_id the session re-interviews an
 * existing listing (draft seeded, provenance 'imported'); with a source_url the
 * site is ingested + extracted before the first turn; with neither the owner is
 * starting from scratch. Auth: web cookie or mobile bearer — sessions persist
 * only for authenticated owners.
 */
export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:intake:create', 10, 60_000)
  if (limited) return limited

  const { supabase, user } = await resolveRequestAuth(request)
  if (!user) return NextResponse.json({ error: 'Sign in to start your interview.', code: 'auth_required' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const sourceUrl = typeof body.source_url === 'string' ? body.source_url.trim() : ''
  const pageId = typeof body.page_id === 'string' ? body.page_id.trim() : ''

  let state: IntakeState
  const nowIso = new Date().toISOString()

  if (pageId) {
    // Re-interview: the page must belong to the caller (RLS + explicit eq).
    const { data: page } = await supabase
      .from('pages')
      .select(OWNER_PAGE_SELECT)
      .eq('id', pageId)
      .eq('owner_id', user.id)
      .maybeSingle<AgentPage>()
    if (!page) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })
    state = createIntakeState({
      seed: {
        name: page.name ?? '',
        description: page.description ?? '',
        website_url: page.website_url ?? '',
        cta_url: page.cta_url ?? '',
        cta_label: page.cta_label ?? '',
        audience: page.audience ?? '',
        location: page.location ?? '',
        contact_email: page.contact_email ?? '',
        industry: page.industry ?? '',
        services: page.services ?? [],
        products: page.products ?? [],
        faqs: page.faqs ?? [],
      },
    })
    const added = applyIntakeAction(state, {
      type: 'ADD_SOURCE',
      source: { id: crypto.randomUUID(), kind: 'integration', value: `page:${pageId}`, label: 'Existing listing', addedAt: nowIso },
    })
    if (added.ok) state = added.state
  } else if (sourceUrl) {
    const urlError = getImportUrlError(sourceUrl)
    if (urlError) return NextResponse.json({ error: urlError }, { status: 400 })
    state = createIntakeState()
    const sourceId = crypto.randomUUID()
    const added = applyIntakeAction(state, {
      type: 'ADD_SOURCE',
      source: { id: sourceId, kind: 'url', value: sourceUrl, label: sourceUrl, addedAt: nowIso },
    })
    if (added.ok) state = added.state
    try {
      const extraction = importResultToExtraction(sourceId, await analyzeSite(sourceUrl))
      const recorded = applyIntakeAction(state, { type: 'RECORD_EXTRACTION', extraction })
      if (recorded.ok) state = recorded.state
    } catch (error) {
      // Extraction is best-effort at create time — the interview proceeds from
      // scratch and the agent can retry ingestion mid-conversation.
      console.warn('[intake] create-time extraction failed', error)
    }
  } else {
    // Starting from scratch is a source too (spec §3 INGEST).
    state = createIntakeState()
    const added = applyIntakeAction(state, {
      type: 'ADD_SOURCE',
      source: { id: crypto.randomUUID(), kind: 'none', value: '', label: 'Starting from scratch', addedAt: nowIso },
    })
    if (added.ok) state = added.state
  }

  state = initialAnalyzedState(state)

  const { data, error } = await supabase
    .from('intake_sessions')
    .insert({
      owner_id: user.id,
      page_id: pageId || null,
      status: 'active',
      phase: state.phase,
      state,
    })
    .select('id, status, phase')
    .single()
  if (error || !data) {
    console.error('[intake] session insert failed', error)
    return NextResponse.json({ error: 'Could not start the interview.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: data.id, status: data.status, phase: data.phase, state }, { status: 201 })
}

/**
 * GET /api/agents/intake/threads — the owner's resumable interviews, newest
 * first (cross-device resume: start on the couch, finish on desktop).
 */
export async function GET(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:intake:list', 40, 60_000)
  if (limited) return limited

  const { supabase, user } = await resolveRequestAuth(request)
  if (!user) return NextResponse.json({ error: 'Sign in to see your interviews.', code: 'auth_required' }, { status: 401 })

  const { data, error } = await supabase
    .from('intake_sessions')
    .select('id, status, phase, page_id, updated_at')
    .eq('owner_id', user.id)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(20)
  if (error) return NextResponse.json({ error: 'Could not load your interviews.' }, { status: 500 })

  const sessions = (data ?? []).map((s) => ({ id: s.id, status: s.status, phase: s.phase, pageId: s.page_id, updatedAt: s.updated_at }))
  return NextResponse.json({ ok: true, sessions })
}
