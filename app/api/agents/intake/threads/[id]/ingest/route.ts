import { NextResponse, type NextRequest } from 'next/server'
import { importResultToExtraction, loadIntakeSession, sessionState } from '../../../../../../../lib/agents/intake'
import { analyzeSite, getImportUrlError, llmExtractOffers } from '../../../../../../../lib/importer'
import { applyIntakeAction, type IntakeExtraction, type IntakeSource, type IntakeState } from '../../../../../../../lib/intake'
import { captureEvent } from '../../../../../../../lib/observability'
import { enforceRateLimit } from '../../../../../../../lib/rate-limit'
import { resolveRequestAuth } from '../../../../../../../lib/server/request-auth'
import {
  gateIntegrationImport,
  importIntegrationOffers,
  INGESTABLE_PROVIDERS,
  type IntegrationIngestInput,
} from '../../../../../../../lib/server/integration-importers'
import { getCalendlyPat } from '../../../../../../../lib/server/page-integration-credentials'

// Ingestion crawls / live catalog fetches - keep the budget generous but bounded.
export const maxDuration = 60

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const PROVIDER_LABELS: Record<string, string> = { calendly: 'Calendly', shopify: 'Shopify', square: 'Square', acuity: 'Acuity' }

/** Build the provider-specific ingest input from the request body, or an error. */
function buildIntegrationInput(provider: string, body: Record<string, unknown>): IntegrationIngestInput | { error: string } {
  switch (provider) {
    case 'calendly': {
      const token = str(body.token)
      return token ? { provider, token } : { error: 'A Calendly Personal Access Token is required.' }
    }
    case 'shopify': {
      const shop = str(body.shop)
      const accessToken = str(body.accessToken)
      if (!shop || !accessToken) return { error: 'A Shopify store domain and access token are required.' }
      return { provider, shop, accessToken, limit: typeof body.limit === 'number' ? body.limit : undefined }
    }
    case 'square': {
      const accessToken = str(body.accessToken)
      return accessToken ? { provider, accessToken } : { error: 'A Square access token is required.' }
    }
    case 'acuity': {
      const userId = str(body.userId)
      const apiKey = str(body.apiKey)
      if (!userId || !apiKey) return { error: 'An Acuity User ID and API key are required.' }
      return { provider, userId, apiKey }
    }
    default:
      return { error: `Unsupported integration: ${provider}.` }
  }
}

/**
 * POST /api/agents/intake/threads/[id]/ingest - add a source mid-conversation
 * (spec §5). Body: { url? } | { text? } | { provider, ...credentials }. Sources
 * append; extraction folds into the working draft non-destructively (stated
 * facts always win) and gaps re-analyze in place.
 *
 * Integration sources pull the seller's OWN live catalog (Calendly/Shopify/
 * Square/Acuity) via the shared importers — Pro-gated like the manual import
 * routes, and REAL offers only (a failed fetch is an error, never sample data,
 * so the interview never folds invented offers into the draft).
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

  const provider = str(body.provider).toLowerCase()
  const url = str(body.url)
  const text = str(body.text)

  if (provider) {
    if (!(INGESTABLE_PROVIDERS as readonly string[]).includes(provider)) {
      return NextResponse.json({ error: `Unsupported integration: ${provider}.` }, { status: 400 })
    }
  } else if (!url && !text) {
    return NextResponse.json({ error: 'Provide a url, pasted text, or an integration to ingest.' }, { status: 400 })
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

  // Build the extraction (and the source record) per source type.
  let source: IntakeSource
  let extraction: IntakeExtraction

  if (provider) {
    const pageId = (row as { page_id?: string | null }).page_id ?? undefined

    // Authorize FIRST (Pro on the effective owner: re-interview → the page owner;
    // new draft → self) — before touching any stored secret or external API.
    const gate = await gateIntegrationImport({
      supabase,
      user,
      pageId,
      proMessage: 'Connecting a live integration is a Pro feature. Upgrade to sync your catalog, or paste your offers and I’ll structure them (free).',
    })
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

    // Re-interview convenience: a Calendly connect with no token falls back to
    // the page's saved (encrypted) PAT, so the seller doesn't re-paste it. Only
    // reached once the caller is authorized for this page.
    let effectiveBody = body
    if (provider === 'calendly' && !str(body.token) && pageId) {
      const savedToken = await getCalendlyPat(pageId)
      if (savedToken) effectiveBody = { ...body, token: savedToken }
    }
    const input = buildIntegrationInput(provider, effectiveBody)
    if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 })

    const result = await importIntegrationOffers(input)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 })

    const label = PROVIDER_LABELS[provider] ?? provider
    source = { id: sourceId, kind: 'integration', value: provider, label, addedAt: nowIso }
    extraction = { sourceId, offers: result.offers, clarifyingQuestions: null }
  } else if (url) {
    source = { id: sourceId, kind: 'url', value: url, label: url, addedAt: nowIso }
    try {
      extraction = importResultToExtraction(sourceId, await analyzeSite(url))
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not ingest that source.' }, { status: 422 })
    }
  } else {
    source = { id: sourceId, kind: 'text', value: text.slice(0, 20_000), label: 'Pasted text', addedAt: nowIso }
    try {
      // Pasted text rides the importer's LLM offer extractor (best-effort — []
      // without a configured LLM; the interview simply asks instead).
      const offers = await llmExtractOffers(text)
      extraction = { sourceId, offers, clarifyingQuestions: null }
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not ingest that source.' }, { status: 422 })
    }
  }

  const added = applyIntakeAction(state, { type: 'ADD_SOURCE', source })
  if (!added.ok) return NextResponse.json({ error: added.error, code: added.code }, { status: 400 })
  state = added.state

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
    kind: provider ? 'integration' : url ? 'url' : 'text',
    ...(provider ? { provider } : {}),
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
