// Seller intake interview — the platform service behind /api/agents/intake/*
// (spec: nexez-intake-interview-spec.md §5). Mirrors the Nexie pattern: routes
// are thin; this module owns the turn loop, the LLM tool schema, and the
// materialization at commit. Every tool call the LLM makes is validated by the
// pure reducer (lib/intake) — the model cannot skip phases, invent offers, or
// commit; validation failures are fed back as tool results so it can repair.
//
// Dependency injection: the LLM call and the site importer are injectable
// (deps.llm / deps.importSite) so unit tests run hermetically and a missing
// LLM_API_KEY degrades to a deterministic interviewer that asks the top gap
// batch verbatim (structured quick-answers keep the loop functional without
// any model).
import type { SupabaseClient } from '@supabase/supabase-js'
import { getReadinessScore, normalizeSlug, type AgentPage, type OfferItem } from '../agent-page'
import type { ImportResult } from '../importer'
import { INTAKE_SAFETY_PREAMBLE, fenceUntrusted } from '../llm-engine/prompt-safety'
import {
  analyzeGaps,
  applyIntakeAction,
  createIntakeState,
  handoffEligible,
  VOLUNTEERED_PREFIX,
  type Gap,
  type GapAnswer,
  type IntakeApplyResult,
  type IntakeDraft,
  type IntakeExtraction,
  type IntakePageField,
  type IntakeState,
} from '../intake'

type Db = SupabaseClient

export type IntakeSessionRow = {
  id: string
  owner_id: string
  page_id: string | null
  status: 'active' | 'handed_off' | 'abandoned'
  phase: IntakeState['phase']
  state: IntakeState | Record<string, never>
  created_at?: string
  updated_at?: string
}

export type IntakeCard =
  | { type: 'source_ingested'; sourceId: string; label: string; offers: number; confidence?: number }
  | { type: 'gap_batch'; gaps: Gap[] }
  | { type: 'draft_summary'; draft: IntakeDraft; readiness: number; handoffEligible: boolean }
  | { type: 'handoff'; via: 'agent' | 'owner_exit' }

export type IntakeTurnResult =
  | { ok: true; message: string; cards: IntakeCard[]; state: IntakeState; status: IntakeSessionRow['status'] }
  | { ok: false; status: number; error: string; code?: string }

type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }
type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }
type ChatResponse = { choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }> }

export type IntakeDeps = {
  /** OpenAI-compatible chat completion. Injectable for tests / alternates. */
  llm?: (messages: ChatMessage[], tools: typeof INTAKE_TOOLS) => Promise<ChatResponse>
  /** Site importer boundary (lib/importer analyzeSite). Injectable for tests. */
  importSite?: (url: string) => Promise<ImportResult>
  /** Clock + id source (kept out of the pure reducer; injectable for tests). */
  now?: () => Date
  newId?: () => string
}

// ---------------------------------------------------------------------------
// System prompt + tool schema (spec §5)

export const INTAKE_SYSTEM_PROMPT = `You are the Nexez intake interviewer — a seller-side agent genuinely interested in understanding this business so it succeeds on the platform.

You are NOT a form. The extraction already captured what the owner's website and integrations state; your job is to interview the owner ONLY about the gaps the platform surfaces to you, conversationally.

Rules:
- Ask at most 1–3 RELATED questions per turn (one ask_gaps call), acknowledging what you already learned ("Your site lists three wedding packages — do those prices still hold?"). Never a laundry list.
- Map free-form answers into record_answers with structured field updates. Quote the owner faithfully in the answer text.
- Never invent offers, prices, or facts. propose_offers only curates what extraction or the owner provided. If a fact is missing, ask.
- The owner can say "skip", "later", or "just take me to the form" — record skips, and never pressure.
- When the platform tells you no blocking gaps remain, summarize the draft in plain language and call request_handoff so the owner can review in the builder. Keep going on quality/opportunity gaps only if the owner is engaged.
- Keep replies short, warm, and specific to THIS business. Sentence case. No emoji.` + INTAKE_SAFETY_PREAMBLE

export const INTAKE_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'ask_gaps',
      description: 'Ask the owner about 1–3 related gaps (by id, from the CURRENT GAPS list). phrasing is your conversational wording of those questions, shown to the owner.',
      parameters: {
        type: 'object',
        properties: {
          gapIds: { type: 'array', items: { type: 'string' }, maxItems: 3 },
          phrasing: { type: 'string' },
        },
        required: ['gapIds', 'phrasing'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'record_answers',
      description: 'Record the owner\'s answers to previously asked gaps, mapping their words into structured field updates. Use skipped:true when they decline.',
      parameters: {
        type: 'object',
        properties: {
          answers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                gapId: { type: 'string' },
                answer: { type: 'string' },
                skipped: { type: 'boolean' },
                fields: { type: 'array', items: { type: 'object' } },
              },
              required: ['gapId', 'answer'],
            },
          },
        },
        required: ['answers'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_page_field',
      description: 'Record a fact the owner volunteered unprompted (a page-level field only). statement is their wording.',
      parameters: {
        type: 'object',
        properties: {
          field: { type: 'string', enum: ['name', 'description', 'website_url', 'cta_url', 'cta_label', 'audience', 'location', 'contact_email', 'industry'] },
          value: { type: 'string' },
          statement: { type: 'string' },
        },
        required: ['field', 'value', 'statement'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'propose_offers',
      description: 'Curate the draft\'s offers for one kind (services|products). Only offers derived from extraction or stated by the owner are accepted.',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['services', 'products'] },
          offers: { type: 'array', items: { type: 'object' } },
        },
        required: ['kind', 'offers'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'ingest_url',
      description: 'Ingest another URL the owner mentioned (their site, a pricing page, a socials page). The platform crawls and extracts it.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'request_handoff',
      description: 'Offer the builder handoff once no blocking gaps remain. summary is your plain-language recap of the draft, shown to the owner.',
      parameters: {
        type: 'object',
        properties: { summary: { type: 'string' } },
        required: ['summary'],
      },
    },
  },
]

// ---------------------------------------------------------------------------
// Extraction mapping

/** Trim an ImportResult into the serializable extraction the session stores. */
export function importResultToExtraction(sourceId: string, result: ImportResult): IntakeExtraction {
  return {
    sourceId,
    title: result.title || null,
    description: result.description || null,
    website_url: result.website_url || null,
    offers: (result.structuredOffers ?? []).map((o) => ({ ...o })),
    faqs: result.faqs ?? null,
    industry: result.industry ?? null,
    audience: result.audience ?? null,
    location: result.location ?? null,
    cta_label: result.cta_label || null,
    cta_url: result.cta_url || null,
    clarifyingQuestions: result.clarifyingQuestions ?? null,
    confidence: result.confidence,
  }
}

// ---------------------------------------------------------------------------
// Session load/persist (RLS-bound — tenancy is enforced by both the .eq and RLS)

export async function loadIntakeSession(db: Db, sessionId: string, ownerId: string): Promise<IntakeSessionRow | null> {
  const { data, error } = await db
    .from('intake_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('owner_id', ownerId)
    .maybeSingle()
  if (error || !data) return null
  return data as IntakeSessionRow
}

/** Parse the stored JSONB into a usable IntakeState, tolerating legacy/empty rows. */
export function sessionState(row: IntakeSessionRow): IntakeState {
  const state = row.state as Partial<IntakeState> | null
  if (!state || typeof state !== 'object' || !state.phase) return createIntakeState()
  return {
    phase: state.phase,
    sources: state.sources ?? [],
    extractions: state.extractions ?? [],
    gaps: state.gaps ?? [],
    askedGapIds: state.askedGapIds ?? [],
    answers: state.answers ?? [],
    draft: state.draft ?? createIntakeState().draft,
    provenance: state.provenance ?? {},
    messages: state.messages ?? [],
    handoff: state.handoff ?? null,
  }
}

async function persistState(db: Db, row: IntakeSessionRow, state: IntakeState, patch: Partial<IntakeSessionRow> = {}) {
  const { error } = await db
    .from('intake_sessions')
    .update({ state, phase: state.phase, updated_at: new Date().toISOString(), ...patch })
    .eq('id', row.id)
    .eq('owner_id', row.owner_id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// The turn

const MAX_LLM_ROUNDS = 3
const CONTEXT_MESSAGES = 12
const CONTEXT_GAPS = 10

export async function handleIntakeTurn(
  input: {
    db: Db
    user: { id: string; email?: string | null }
    sessionId: string
    content?: string
    /** Structured quick-answers from the client's gap_batch card — bypasses LLM mapping. */
    structuredAnswers?: GapAnswer[]
  },
  deps: IntakeDeps = {},
): Promise<IntakeTurnResult> {
  const now = deps.now ?? (() => new Date())
  const newId = deps.newId ?? (() => crypto.randomUUID())

  const row = await loadIntakeSession(input.db, input.sessionId, input.user.id)
  if (!row) return { ok: false, status: 404, error: 'Interview not found.' }
  if (row.status !== 'active') {
    return { ok: false, status: 409, error: 'This interview has already handed off to the builder.', code: 'already_handed_off' }
  }

  let state = sessionState(row)
  const cards: IntakeCard[] = []

  // 1. Record the owner's turn.
  if (input.content?.trim()) {
    const applied = applyIntakeAction(state, {
      type: 'ADD_MESSAGE',
      message: { id: newId(), role: 'owner', content: input.content.trim().slice(0, 4000), at: now().toISOString() },
    })
    if (applied.ok) state = applied.state
  }

  // 2. Structured quick-answers apply directly — no LLM interpretation needed.
  if (input.structuredAnswers?.length) {
    const applied = applyIntakeAction(state, { type: 'RECORD_ANSWERS', answers: input.structuredAnswers })
    if (!applied.ok) return { ok: false, status: 400, error: applied.error, code: applied.code }
    state = applied.state
  }

  // 3. Auto-advance through analysis once sources exist — the conversational
  //    surface never exposes ANALYZE_GAPS as something the LLM must remember.
  if ((state.phase === 'INGEST' || state.phase === 'EXTRACT') && state.sources.length > 0) {
    const applied = applyIntakeAction(state, { type: 'ANALYZE_GAPS' })
    if (applied.ok) state = applied.state
  }

  // 4. The agent's turn: LLM when configured, deterministic interviewer otherwise.
  const llm = deps.llm ?? (process.env.LLM_API_KEY ? defaultChatCompletion : null)
  let message: string
  if (llm && state.phase !== 'REVIEW_HANDOFF') {
    const turn = await runLlmTurn(state, llm, { now, newId, importSite: deps.importSite, cards })
    state = turn.state
    message = turn.message
  } else {
    const turn = deterministicTurn(state, { now, newId })
    state = turn.state
    message = turn.message
    cards.push(...turn.cards)
  }

  // 5. Standing cards: the draft summary whenever handoff is on the table.
  if (state.phase === 'REVIEW_HANDOFF' || handoffEligible(state)) {
    cards.push({ type: 'draft_summary', draft: state.draft, readiness: draftReadiness(state.draft), handoffEligible: true })
  }
  if (state.handoff) cards.push({ type: 'handoff', via: state.handoff.via })

  try {
    await persistState(input.db, row, state)
  } catch {
    return { ok: false, status: 500, error: 'Could not save the interview. Please retry.' }
  }
  return { ok: true, message, cards, state, status: row.status }
}

/** Readiness of the working draft, through the same rubric the platform uses. */
export function draftReadiness(draft: IntakeDraft): number {
  const page: Partial<AgentPage> = {
    name: draft.name || undefined,
    slug: draft.name ? normalizeSlug(draft.name) : undefined,
    description: draft.description || null,
    website_url: draft.website_url || null,
    cta_url: draft.cta_url || null,
    audience: draft.audience || null,
    industry: draft.industry || null,
    location: draft.location || null,
    contact_email: draft.contact_email || null,
    services: draft.services,
    products: draft.products,
    faqs: draft.faqs,
    is_published: false,
  }
  return getReadinessScore(page)
}

// ---------------------------------------------------------------------------
// Deterministic interviewer (no LLM): ask the top gap batch verbatim. The
// gap_batch card's quick answers keep the loop functional via structuredAnswers.

function deterministicTurn(
  state: IntakeState,
  ids: { now: () => Date; newId: () => string },
): { state: IntakeState; message: string; cards: IntakeCard[] } {
  if (state.phase === 'REVIEW_HANDOFF') {
    return { state, message: 'This interview has wrapped — your draft is ready to review in the builder.', cards: [] }
  }
  const batch = state.gaps.slice(0, 3)
  if (batch.length === 0) {
    if (state.sources.length === 0) {
      return {
        state,
        message: 'Share your website URL (or say "start from scratch") and I will pull in everything it already says before asking you anything.',
        cards: [],
      }
    }
    return {
      state,
      message: 'I have everything I need — review your draft in the builder whenever you are ready.',
      cards: [],
    }
  }
  const phrasing = batch.map((g) => g.question).join('\n')
  const applied = applyIntakeAction(state, {
    type: 'ASK_GAPS',
    gapIds: batch.map((g) => g.id),
    message: { id: ids.newId(), role: 'agent', content: phrasing, at: ids.now().toISOString() },
  })
  const next = applied.ok ? applied.state : state
  return { state: next, message: phrasing, cards: [{ type: 'gap_batch', gaps: batch }] }
}

// ---------------------------------------------------------------------------
// LLM turn loop

async function runLlmTurn(
  initial: IntakeState,
  llm: NonNullable<IntakeDeps['llm']>,
  ctx: { now: () => Date; newId: () => string; importSite?: IntakeDeps['importSite']; cards: IntakeCard[] },
): Promise<{ state: IntakeState; message: string }> {
  let state = initial
  const transcript: ChatMessage[] = [
    { role: 'system', content: INTAKE_SYSTEM_PROMPT },
    { role: 'user', content: buildContextBlock(state) },
  ]

  let finalText = ''
  for (let round = 0; round < MAX_LLM_ROUNDS; round++) {
    let response: ChatResponse
    try {
      response = await llm(transcript, INTAKE_TOOLS)
    } catch {
      break // model unavailable mid-turn → fall back below
    }
    const assistant = response.choices?.[0]?.message
    if (!assistant) break
    const toolCalls = Array.isArray(assistant.tool_calls) ? assistant.tool_calls : []
    if (typeof assistant.content === 'string' && assistant.content.trim()) {
      finalText = assistant.content.trim()
    }
    if (toolCalls.length === 0) break

    transcript.push({ role: 'assistant', content: assistant.content ?? null, tool_calls: toolCalls })
    for (const call of toolCalls) {
      const executed = await executeToolCall(state, call, ctx)
      state = executed.state
      if (executed.message) finalText = executed.message
      transcript.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(executed.result) })
    }
    // A successful handoff ends the interview — no further rounds (any extra
    // tool call would only bounce off already_handed_off).
    if (state.handoff) break
    // Refresh the machine context after mutations so the next round sees
    // current gaps/eligibility rather than a stale list.
    transcript.push({ role: 'user', content: buildContextBlock(state) })
  }

  if (!finalText) {
    const fallback = deterministicTurn(state, ctx)
    state = fallback.state
    finalText = fallback.message
    ctx.cards.push(...fallback.cards)
  }
  return { state, message: finalText }
}

/** The machine-truth block the model reasons over each round. Owner words are
 *  already in state.messages; extraction/pasted content is fenced as data. */
function buildContextBlock(state: IntakeState): string {
  const gaps = state.gaps.slice(0, CONTEXT_GAPS).map((g) => ({ id: g.id, kind: g.kind, question: g.question, why: g.why }))
  const recent = state.messages.slice(-CONTEXT_MESSAGES).map((m) => `${m.role === 'owner' ? 'OWNER' : 'YOU'}: ${m.content}`)
  const draftSummary = {
    name: state.draft.name,
    description: state.draft.description.slice(0, 240),
    industry: state.draft.industry,
    location: state.draft.location,
    audience: state.draft.audience,
    offers: [...state.draft.services, ...state.draft.products].map((o) => ({ name: o.name, price: o.price, duration: o.duration })),
    faqs: state.draft.faqs.length,
  }
  return [
    `PHASE: ${state.phase}`,
    `HANDOFF_ELIGIBLE: ${handoffEligible(state)}`,
    `CURRENT DRAFT:\n${JSON.stringify(draftSummary, null, 1)}`,
    `CURRENT GAPS (ask via ask_gaps with these ids):\n${JSON.stringify(gaps, null, 1)}`,
    recent.length ? `CONVERSATION SO FAR:\n${fenceUntrusted('OWNER CONVERSATION', recent.join('\n'))}` : 'CONVERSATION SO FAR: (none — this is your opening turn)',
    'Respond to the owner now. Record any answers/facts from their last message first, then ask the next 1–3 related gaps, or request_handoff when eligible.',
  ].join('\n\n')
}

type ExecutedTool = { state: IntakeState; result: Record<string, unknown>; message?: string }

async function executeToolCall(
  state: IntakeState,
  call: ToolCall,
  ctx: { now: () => Date; newId: () => string; importSite?: IntakeDeps['importSite']; cards: IntakeCard[] },
): Promise<ExecutedTool> {
  let args: Record<string, unknown>
  try {
    args = JSON.parse(call.function.arguments || '{}')
  } catch {
    return { state, result: { ok: false, code: 'bad_arguments', error: 'Tool arguments were not valid JSON.' } }
  }

  const fold = (applied: IntakeApplyResult, onOk?: (next: IntakeState) => { result?: Record<string, unknown>; message?: string }): ExecutedTool => {
    if (!applied.ok) return { state, result: { ok: false, code: applied.code, error: applied.error } }
    const extra = onOk?.(applied.state) ?? {}
    return { state: applied.state, result: { ok: true, ...extra.result }, message: extra.message }
  }

  switch (call.function.name) {
    case 'ask_gaps': {
      const gapIds = Array.isArray(args.gapIds) ? (args.gapIds as string[]) : []
      const phrasing = typeof args.phrasing === 'string' ? args.phrasing.trim() : ''
      if (!phrasing) return { state, result: { ok: false, code: 'bad_arguments', error: 'ask_gaps needs phrasing.' } }
      return fold(
        applyIntakeAction(state, {
          type: 'ASK_GAPS',
          gapIds,
          message: { id: ctx.newId(), role: 'agent', content: phrasing, at: ctx.now().toISOString() },
        }),
        (next) => {
          ctx.cards.push({ type: 'gap_batch', gaps: next.gaps.filter((g) => gapIds.includes(g.id)) })
          return { message: phrasing }
        },
      )
    }
    case 'record_answers': {
      const answers = Array.isArray(args.answers) ? (args.answers as GapAnswer[]) : []
      return fold(applyIntakeAction(state, { type: 'RECORD_ANSWERS', answers }), (next) => ({
        result: { remainingGaps: next.gaps.length, handoffEligible: handoffEligible(next) },
      }))
    }
    case 'set_page_field': {
      const field = args.field as IntakePageField
      const value = typeof args.value === 'string' ? args.value : ''
      const statement = typeof args.statement === 'string' ? args.statement : value
      const answer: GapAnswer = {
        gapId: `${VOLUNTEERED_PREFIX}page:${field}`,
        answer: statement,
        fields: [{ target: 'page', field, value }],
      }
      return fold(applyIntakeAction(state, { type: 'RECORD_ANSWERS', answers: [answer] }))
    }
    case 'propose_offers': {
      const kind = args.kind === 'products' ? 'products' : 'services'
      const offers = Array.isArray(args.offers) ? (args.offers as OfferItem[]) : []
      return fold(applyIntakeAction(state, { type: 'PROPOSE_OFFERS', kind, offers }))
    }
    case 'ingest_url': {
      const url = typeof args.url === 'string' ? args.url.trim() : ''
      if (!ctx.importSite) {
        return { state, result: { ok: false, code: 'importer_unavailable', error: 'URL ingestion is unavailable right now — continue the interview.' } }
      }
      const sourceId = ctx.newId()
      const added = applyIntakeAction(state, {
        type: 'ADD_SOURCE',
        source: { id: sourceId, kind: 'url', value: url, label: url, addedAt: ctx.now().toISOString() },
      })
      if (!added.ok) return { state, result: { ok: false, code: added.code, error: added.error } }
      let extraction: IntakeExtraction
      try {
        extraction = importResultToExtraction(sourceId, await ctx.importSite(url))
      } catch {
        return { state, result: { ok: false, code: 'import_failed', error: 'Could not crawl that URL. Ask the owner to paste the key details instead.' } }
      }
      return fold(applyIntakeAction(added.state, { type: 'RECORD_EXTRACTION', extraction }), (next) => {
        ctx.cards.push({ type: 'source_ingested', sourceId, label: url, offers: extraction.offers.length, confidence: extraction.confidence })
        return { result: { offersFound: extraction.offers.length, newGaps: next.gaps.length } }
      })
    }
    case 'request_handoff': {
      const summary = typeof args.summary === 'string' && args.summary.trim() ? args.summary.trim() : 'Your draft is ready to review in the builder.'
      return fold(
        applyIntakeAction(state, {
          type: 'REQUEST_HANDOFF',
          at: ctx.now().toISOString(),
          message: { id: ctx.newId(), role: 'agent', content: summary, at: ctx.now().toISOString() },
        }),
        () => ({ message: summary }),
      )
    }
    default:
      return { state, result: { ok: false, code: 'unknown_tool', error: `No tool named ${call.function.name}.` } }
  }
}

// ---------------------------------------------------------------------------
// Commit (spec §3 REVIEW_HANDOFF): materialize through the existing paths. The
// builder remains the single source of truth for editing — a NEW page is
// created as a draft (is_published false) exactly like /create does; a
// re-interview stages onto pages.draft (the D12 overlay) and never touches
// live columns.

export type IntakeCommitResult =
  | { ok: true; pageId: string; slug: string | null; alreadyCommitted: boolean }
  | { ok: false; status: number; error: string }

export async function commitIntakeSession(
  input: { db: Db; admin: Db; user: { id: string }; sessionId: string },
  deps: { now?: () => Date } = {},
): Promise<IntakeCommitResult> {
  const now = deps.now ?? (() => new Date())
  const row = await loadIntakeSession(input.db, input.sessionId, input.user.id)
  if (!row) return { ok: false, status: 404, error: 'Interview not found.' }
  if (row.status === 'handed_off' && row.page_id) {
    // Idempotent replay — the client can safely retry a commit.
    return { ok: true, pageId: row.page_id, slug: null, alreadyCommitted: true }
  }
  if (row.status !== 'active') return { ok: false, status: 409, error: 'This interview is no longer active.' }

  let state = sessionState(row)
  if (state.phase !== 'REVIEW_HANDOFF') {
    // An owner-initiated commit is always allowed — it IS the exit.
    const applied = applyIntakeAction(state, { type: 'EXIT_TO_BUILDER', at: now().toISOString() })
    if (!applied.ok) return { ok: false, status: 409, error: applied.error }
    state = applied.state
  }

  const draft = state.draft
  let pageId: string
  let slug: string | null = null

  if (row.page_id) {
    // Re-interview: stage onto the existing page's draft overlay (owner RLS write).
    const { error } = await input.db
      .from('pages')
      .update({
        draft: {
          name: draft.name || undefined,
          description: draft.description || null,
          services: draft.services,
          products: draft.products,
          faqs: draft.faqs,
          industry: draft.industry || null,
        },
        draft_updated_at: now().toISOString(),
      })
      .eq('id', row.page_id)
      .eq('owner_id', input.user.id)
    if (error) return { ok: false, status: 500, error: 'Could not stage the draft onto your listing.' }
    pageId = row.page_id
  } else {
    // New listing: same insert shape as /create, always as a draft — publishing
    // stays a human decision in the builder (spec §2.3).
    const name = draft.name.trim() || 'Untitled listing'
    slug = await uniqueIntakeSlug(input.admin, normalizeSlug(name) || 'listing')
    const { data, error } = await input.admin
      .from('pages')
      .insert({
        owner_id: input.user.id,
        name,
        slug,
        description: draft.description || null,
        website_url: draft.website_url || null,
        cta_url: draft.cta_url || draft.website_url || null,
        cta_label: draft.cta_label || 'Visit website',
        audience: draft.audience || null,
        location: draft.location || null,
        contact_email: draft.contact_email || null,
        industry: draft.industry || null,
        services: draft.services,
        products: draft.products,
        faqs: draft.faqs,
        is_published: false,
        branding: {},
      })
      .select('id, slug')
      .single()
    if (error || !data) return { ok: false, status: 500, error: 'Could not create your listing from the interview.' }
    pageId = data.id
    slug = data.slug
  }

  try {
    await persistState(input.db, row, state, { status: 'handed_off', page_id: pageId })
  } catch {
    return { ok: false, status: 500, error: 'Draft created, but the interview could not be closed. Retry to finish.' }
  }
  return { ok: true, pageId, slug, alreadyCommitted: false }
}

/** First-free slug: base, base-2, base-3… (checked with the admin client since
 *  slug uniqueness is global and RLS hides other tenants' pages). */
async function uniqueIntakeSlug(admin: Db, base: string): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`
    const { data } = await admin.from('pages').select('id').eq('slug', candidate).maybeSingle()
    if (!data) return candidate
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`
}

// ---------------------------------------------------------------------------
// Default LLM boundary (mirrors the Nexie chatCompletion fetch)

async function defaultChatCompletion(messages: ChatMessage[], tools: typeof INTAKE_TOOLS): Promise<ChatResponse> {
  const base = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.LLM_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || 'gpt-4o-mini',
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.4,
      max_tokens: 700,
    }),
    signal: AbortSignal.timeout(18_000),
  })
  if (!res.ok) throw new Error(`Intake model request failed with HTTP ${res.status}`)
  return res.json()
}

/** Re-analyze helper for freshly created/seeded sessions (used by the threads
 *  create route so the first GET already shows gaps). */
export function initialAnalyzedState(state: IntakeState): IntakeState {
  if ((state.phase === 'INGEST' || state.phase === 'EXTRACT') && state.sources.length > 0) {
    const applied = applyIntakeAction(state, { type: 'ANALYZE_GAPS' })
    if (applied.ok) return applied.state
  }
  return state
}

export { analyzeGaps, createIntakeState }
