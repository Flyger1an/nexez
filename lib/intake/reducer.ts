// Seller intake interview - the pure state machine (spec §3).
// No I/O, no Date.now(), no LLM: timestamps/ids arrive in action payloads, so
// the reducer is deterministic, unit-testable, and resume-safe. It never
// throws - every action returns a discriminated IntakeApplyResult, and an
// invalid action leaves the prior state authoritative (this is the layer that
// stops the LLM from skipping phases, inventing offers, or committing).
import type { OfferItem, OfferKind } from '../agent-page'
import {
  getOfferAttributes,
  getOfferCustomerInputs,
  mergeProposedOfferPreservingConfiguration,
  withOfferAttribute,
  withOfferCustomerInput,
} from '../configured-offer'
import { validateOfferAttribute, validateOfferInputField } from '../offer-configuration'
import { analyzeGaps, hasBlockingGaps, offerEntries } from './gaps'
import {
  hasPaidNegotiationRules,
  stripPaidNegotiationRules,
  unauthorizedNegotiationMutation,
} from './negotiation-policy'
import {
  VOLUNTEERED_PREFIX,
  offerProvenanceKey,
  pageProvenanceKey,
  type GapAnswer,
  type IntakeAction,
  type IntakeApplyResult,
  type IntakeDraft,
  type IntakeErrorCode,
  type IntakeEntitlementPolicy,
  type IntakeFieldUpdate,
  type IntakeMessage,
  type IntakePageField,
  type IntakePhase,
  type IntakeState,
  type Provenance,
} from './types'

// ---------------------------------------------------------------------------

export function emptyIntakeDraft(): IntakeDraft {
  return {
    name: '',
    description: '',
    website_url: '',
    cta_url: '',
    cta_label: '',
    audience: '',
    location: '',
    contact_email: '',
    industry: '',
    services: [],
    products: [],
    faqs: [],
  }
}

/**
 * A fresh session. `seed` supports re-interviewing an existing page: seeded
 * fields carry 'imported' provenance (they were ingested from the page, not
 * stated in this conversation).
 */
export function createIntakeState(init?: { seed?: Partial<IntakeDraft> }): IntakeState {
  const draft = emptyIntakeDraft()
  const provenance: Record<string, Provenance> = {}
  const seed = init?.seed
  if (seed) {
    for (const field of PAGE_FIELDS) {
      const value = seed[field]
      if (typeof value === 'string' && value.trim()) {
        draft[field] = value
        provenance[pageProvenanceKey(field)] = 'imported'
      }
    }
    draft.services = (seed.services ?? []).map((o) => ({ ...o }))
    draft.products = (seed.products ?? []).map((o) => ({ ...o }))
    draft.faqs = (seed.faqs ?? []).map((f) => ({ ...f }))
    for (const { offer } of offerEntries(draft)) {
      stampOfferProvenance(provenance, offer, 'imported')
    }
    for (const faq of draft.faqs) {
      provenance[faqProvenanceKey(faq.question)] = 'imported'
    }
  }
  return {
    phase: 'INGEST',
    sources: [],
    extractions: [],
    gaps: [],
    askedGapIds: [],
    answers: [],
    draft,
    provenance,
    messages: [],
    handoff: null,
  }
}

const PAGE_FIELDS: IntakePageField[] = [
  'name',
  'description',
  'website_url',
  'cta_url',
  'cta_label',
  'audience',
  'location',
  'contact_email',
  'industry',
]

/** Offer provenance is keyed by the offer's normalized NAME (not its index),
 *  so it survives reorder, recategorization, and re-proposal. */
export function normalizeOfferName(name: string | undefined | null): string {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function offerFieldProvenanceKey(offer: OfferItem, field: string): string {
  return offerProvenanceKey(normalizeOfferName(offer.name), field)
}

function faqProvenanceKey(question: string): string {
  return `faq:${normalizeOfferName(question)}`
}

const OFFER_PROVENANCE_FIELDS: Array<keyof OfferItem> = [
  'name',
  'price',
  'description',
  'duration',
  'serviceArea',
  'travelFee',
  'url',
]

function stampOfferConfigurationProvenance(
  provenance: Record<string, Provenance>,
  offer: OfferItem,
  kind: Provenance,
) {
  for (const input of getOfferCustomerInputs(offer)) {
    const key = offerFieldProvenanceKey(offer, `input:${input.key}`)
    if (!provenance[key]) provenance[key] = kind
  }
  for (const attribute of getOfferAttributes(offer)) {
    const key = offerFieldProvenanceKey(offer, `attribute:${attribute.key}`)
    if (!provenance[key]) provenance[key] = kind
  }
}

function stampOfferProvenance(provenance: Record<string, Provenance>, offer: OfferItem, kind: Provenance) {
  for (const field of OFFER_PROVENANCE_FIELDS) {
    const value = offer[field]
    if (typeof value === 'string' && value.trim() && !provenance[offerFieldProvenanceKey(offer, field)]) {
      provenance[offerFieldProvenanceKey(offer, field)] = kind
    }
  }
  stampOfferConfigurationProvenance(provenance, offer, kind)
}

function isStatedKey(provenance: Record<string, Provenance>, key: string): boolean {
  const p = provenance[key]
  return p === 'stated' || p === 'suggested_confirmed'
}

// ---------------------------------------------------------------------------

const PRE_HANDOFF: IntakePhase[] = ['INGEST', 'EXTRACT', 'GAP_ANALYSIS', 'INTERVIEW', 'SYNTHESIS']
const ANALYZED: IntakePhase[] = ['GAP_ANALYSIS', 'INTERVIEW', 'SYNTHESIS']

function fail(code: IntakeErrorCode, error: string): IntakeApplyResult {
  return { ok: false, code, error }
}

function appendMessage(messages: IntakeMessage[], message?: IntakeMessage): IntakeMessage[] {
  if (!message) return messages
  if (messages.some((m) => m.id === message.id)) return messages // idempotent replay
  return [...messages, message]
}

/** True when the agent may request handoff: analysis has run and no blocking
 *  gap remains askable (skipped blocking gaps are the owner's explicit call). */
export function handoffEligible(state: IntakeState): boolean {
  return ANALYZED.includes(state.phase) && !hasBlockingGaps(state.gaps)
}

/**
 * Apply one action. Everything the API layer (and therefore the LLM's tool
 * calls) can do to a session goes through here.
 */
export function applyIntakeAction(
  state: IntakeState,
  action: IntakeAction,
  policy: IntakeEntitlementPolicy = { negotiationAllowed: false },
): IntakeApplyResult {
  if (state.handoff && action.type !== 'ADD_MESSAGE') {
    return fail('already_handed_off', 'The interview has already handed off to the builder.')
  }

  switch (action.type) {
    case 'ADD_MESSAGE': {
      return { ok: true, state: { ...state, messages: appendMessage(state.messages, action.message) } }
    }

    case 'ADD_SOURCE': {
      if (!PRE_HANDOFF.includes(state.phase)) {
        return fail('invalid_phase', `Cannot add a source in phase ${state.phase}.`)
      }
      if (state.sources.some((s) => s.id === action.source.id)) {
        return { ok: true, state } // idempotent replay
      }
      return { ok: true, state: { ...state, sources: [...state.sources, action.source] } }
    }

    case 'RECORD_EXTRACTION': {
      if (!PRE_HANDOFF.includes(state.phase)) {
        return fail('invalid_phase', `Cannot record an extraction in phase ${state.phase}.`)
      }
      if (!state.sources.some((s) => s.id === action.extraction.sourceId)) {
        return fail('unknown_source', `No source ${action.extraction.sourceId} on this session.`)
      }
      const extractions = [
        ...state.extractions.filter((e) => e.sourceId !== action.extraction.sourceId),
        action.extraction,
      ]
      const { draft, provenance } = foldExtraction(state, action.extraction)
      const phase: IntakePhase = state.phase === 'INGEST' ? 'EXTRACT' : state.phase
      const next: IntakeState = { ...state, phase, extractions, draft, provenance }
      // Mid-conversation ingest (spec §5 /ingest): re-analyze so new importer
      // questions and coverage changes surface immediately.
      next.gaps = ANALYZED.includes(phase) ? analyzeGaps(next) : next.gaps
      return { ok: true, state: next }
    }

    case 'ANALYZE_GAPS': {
      if (state.phase !== 'INGEST' && state.phase !== 'EXTRACT') {
        return fail('invalid_phase', `Gap analysis runs after ingest/extract, not in ${state.phase}.`)
      }
      if (state.sources.length === 0) {
        return fail('no_sources', 'Add at least one source first (starting from scratch is a source too).')
      }
      const next: IntakeState = { ...state, phase: 'GAP_ANALYSIS' }
      next.gaps = analyzeGaps(next)
      return { ok: true, state: next }
    }

    case 'ASK_GAPS': {
      if (!ANALYZED.includes(state.phase)) {
        return fail('invalid_phase', `Cannot ask questions before gap analysis (phase ${state.phase}).`)
      }
      if (action.gapIds.length === 0) {
        return fail('empty_gap_batch', 'ask_gaps needs at least one gap id.')
      }
      if (action.gapIds.length > 3) {
        return fail('gap_batch_too_large', 'Ask at most 3 related questions per turn - never a laundry list.')
      }
      const known = new Set(state.gaps.map((g) => g.id))
      const unknown = action.gapIds.find((id) => !known.has(id))
      if (unknown) {
        return fail('unknown_gap', `Gap ${unknown} is not currently askable.`)
      }
      const askedGapIds = [...state.askedGapIds]
      for (const id of action.gapIds) {
        if (!askedGapIds.includes(id)) askedGapIds.push(id)
      }
      return {
        ok: true,
        state: { ...state, phase: 'INTERVIEW', askedGapIds, messages: appendMessage(state.messages, action.message) },
      }
    }

    case 'RECORD_ANSWERS': {
      if (!PRE_HANDOFF.includes(state.phase)) {
        return fail('invalid_phase', `Cannot record answers in phase ${state.phase}.`)
      }
      if (action.answers.length === 0) {
        return fail('empty_gap_batch', 'record_answers needs at least one answer.')
      }
      // Valid targets: currently-askable gaps, previously answered/skipped ids
      // (re-answering / changing your mind), or volunteered facts.
      const known = new Set([...state.gaps.map((g) => g.id), ...state.answers.map((a) => a.gapId)])
      for (const answer of action.answers) {
        if (answer.gapId.startsWith(VOLUNTEERED_PREFIX)) continue
        if (!known.has(answer.gapId)) {
          return fail('unknown_gap', `Answer references unknown gap ${answer.gapId}.`)
        }
        if (!ANALYZED.includes(state.phase)) {
          return fail('invalid_phase', 'Only volunteered facts can be recorded before gap analysis.')
        }
      }
      // Validate + fold every update before committing any of them.
      const folded = foldAnswers(state, action.answers)
      if (!folded.ok) return folded
      if (!policy.negotiationAllowed) {
        const renamedOffers = renamedOfferBaselines(state, folded.draft, action.answers)
        const unauthorized = unauthorizedNegotiationMutation(state.draft, folded.draft, renamedOffers)
        if (unauthorized) {
          return fail(
            'feature_not_available',
            `Open-to-offers pricing is available on Pro. Keep "${unauthorized.name || 'this offer'}" fixed, or upgrade before adding or changing negotiation rules.`,
          )
        }
      }
      const answers = dedupeAnswers(state.answers, action.answers)
      const phase: IntakePhase = ANALYZED.includes(state.phase) ? 'SYNTHESIS' : state.phase
      const next: IntakeState = {
        ...state,
        phase,
        answers,
        draft: folded.draft,
        provenance: folded.provenance,
        messages: appendMessage(state.messages, action.message),
      }
      next.gaps = ANALYZED.includes(phase) ? analyzeGaps(next) : next.gaps
      return { ok: true, state: next }
    }

    case 'PROPOSE_OFFERS': {
      if (state.phase === 'INGEST') {
        return fail('invalid_phase', 'Nothing has been extracted yet - offers can only be proposed from sources or stated answers.')
      }
      if (!PRE_HANDOFF.includes(state.phase)) {
        return fail('invalid_phase', `Cannot propose offers in phase ${state.phase}.`)
      }
      const result = foldProposedOffers(state, action.kind, action.offers)
      if (!result.ok) return result
      if (!policy.negotiationAllowed) {
        const unauthorized = unauthorizedNegotiationMutation(state.draft, result.draft)
        if (unauthorized) {
          return fail(
            'feature_not_available',
            `Open-to-offers pricing is available on Pro. Keep "${unauthorized.name || 'this offer'}" fixed, or upgrade before adding or changing negotiation rules.`,
          )
        }
      }
      const next: IntakeState = { ...state, draft: result.draft, provenance: result.provenance }
      next.gaps = ANALYZED.includes(state.phase) ? analyzeGaps(next) : next.gaps
      return { ok: true, state: next }
    }

    case 'REQUEST_HANDOFF': {
      if (!ANALYZED.includes(state.phase)) {
        return fail('invalid_phase', `The agent cannot hand off before gap analysis (phase ${state.phase}).`)
      }
      if (hasBlockingGaps(state.gaps)) {
        const blocking = state.gaps.filter((g) => g.kind === 'blocking').map((g) => g.id)
        return fail('blocking_gaps_remain', `Blocking gaps remain: ${blocking.join(', ')}.`)
      }
      return {
        ok: true,
        state: {
          ...state,
          phase: 'REVIEW_HANDOFF',
          handoff: { via: 'agent', at: action.at },
          messages: appendMessage(state.messages, action.message),
        },
      }
    }

    case 'EXIT_TO_BUILDER': {
      // The owner can bail at ANY point - every exit lands in the builder with
      // everything captured so far (spec §3 INTERVIEW).
      return {
        ok: true,
        state: { ...state, phase: 'REVIEW_HANDOFF', handoff: { via: 'owner_exit', at: action.at } },
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Folding

/** Fold an extraction into the draft: fill-empty semantics for page fields
 *  (never overwrite anything, least of all a stated fact), append-dedup for
 *  offers and FAQs. Everything folded carries 'imported' provenance. */
function foldExtraction(
  state: IntakeState,
  extraction: IntakeState['extractions'][number],
): { draft: IntakeDraft; provenance: Record<string, Provenance> } {
  const draft: IntakeDraft = {
    ...state.draft,
    services: state.draft.services.map((o) => ({ ...o })),
    products: state.draft.products.map((o) => ({ ...o })),
    faqs: state.draft.faqs.map((f) => ({ ...f })),
  }
  const provenance = { ...state.provenance }

  const pageValues: Partial<Record<IntakePageField, string | null | undefined>> = {
    name: extraction.title,
    description: extraction.description,
    website_url: extraction.website_url,
    cta_url: extraction.cta_url,
    cta_label: extraction.cta_label,
    audience: extraction.audience,
    location: extraction.location,
    contact_email: extraction.contact_email,
    industry: extraction.industry,
  }
  for (const field of PAGE_FIELDS) {
    const incoming = pageValues[field]
    const key = pageProvenanceKey(field)
    if (typeof incoming === 'string' && incoming.trim() && !draft[field].trim() && !isStatedKey(provenance, key)) {
      draft[field] = incoming
      provenance[key] = 'imported'
    }
  }

  const existingNames = new Set(offerEntries(draft).map(({ offer }) => normalizeOfferName(offer.name)))
  for (const offer of extraction.offers) {
    const norm = normalizeOfferName(offer.name)
    if (!norm || existingNames.has(norm)) continue
    existingNames.add(norm)
    draft.services.push({ ...offer })
    stampOfferProvenance(provenance, offer, 'imported')
  }

  const existingFaqs = new Set(draft.faqs.map((f) => normalizeOfferName(f.question)))
  for (const faq of extraction.faqs ?? []) {
    const norm = normalizeOfferName(faq.question)
    if (!norm || existingFaqs.has(norm)) continue
    existingFaqs.add(norm)
    draft.faqs.push({ ...faq })
    if (!provenance[faqProvenanceKey(faq.question)]) provenance[faqProvenanceKey(faq.question)] = 'imported'
  }

  return { draft, provenance }
}

/** Replace prior answers to the same gap (a re-answer supersedes) - keyed by
 *  gapId, order preserved, replay-idempotent. */
function dedupeAnswers(existing: GapAnswer[], incoming: GapAnswer[]): GapAnswer[] {
  const incomingIds = new Set(incoming.map((a) => a.gapId))
  const kept = existing.filter((a) => !incomingIds.has(a.gapId))
  return [...kept, ...incoming]
}

/** Preserve a retained negotiable contract through an explicit scalar rename. */
function renamedOfferBaselines(
  state: IntakeState,
  nextDraft: IntakeDraft,
  answers: GapAnswer[],
): Map<string, OfferItem> {
  const renamed = new Map<string, OfferItem>()
  const renamedKeys = new Set(
    answers.flatMap((answer) => answer.fields ?? [])
      .filter((update): update is Extract<IntakeFieldUpdate, { target: 'offer' }> => (
        update.target === 'offer' && update.field === 'name'
      ))
      .map((update) => update.offerKey),
  )
  const before = new Map(offerEntries(state.draft).map((entry) => [entry.key, entry.offer]))
  const after = new Map(offerEntries(nextDraft).map((entry) => [entry.key, entry.offer]))
  for (const key of renamedKeys) {
    const retained = before.get(key)
    const current = after.get(key)
    if (retained && current) renamed.set(normalizeOfferName(current.name), retained)
  }
  return renamed
}

type FoldOutcome =
  | { ok: true; draft: IntakeDraft; provenance: Record<string, Provenance> }
  | { ok: false; code: IntakeErrorCode; error: string }

/** Fold answer field-updates into the draft (spec §3 SYNTHESIS). This is the
 *  ONLY code path that writes 'stated' / 'suggested_confirmed' provenance -
 *  which makes the provenance invariant structural rather than by convention.
 *  All-or-nothing: any invalid update rejects the whole batch untouched. */
function foldAnswers(state: IntakeState, answers: GapAnswer[]): FoldOutcome {
  const draft: IntakeDraft = {
    ...state.draft,
    services: state.draft.services.map((o) => ({ ...o })),
    products: state.draft.products.map((o) => ({ ...o })),
    faqs: state.draft.faqs.map((f) => ({ ...f })),
  }
  const provenance = { ...state.provenance }

  for (const answer of answers) {
    if (answer.skipped) continue
    if (answer.fields != null && !Array.isArray(answer.fields)) {
      return { ok: false, code: 'invalid_field_update', error: 'fields must be an ARRAY of field-update objects.' }
    }
    for (const update of answer.fields ?? []) {
      // An LLM-supplied update with a missing/unknown target must FAIL LOUDLY -
      // silently ignoring it reads as "recorded" while the draft never changes
      // (the exact failure the first live pass surfaced).
      if (!update || typeof update !== 'object' || !('target' in update)) {
        return {
          ok: false,
          code: 'invalid_field_update',
          error:
            "Each field update needs a target: 'page' {field,value} · 'offer' {offerKey,field,value} · 'offer_rules' {offerKey,rules} · 'offer_input' {offerKey,input} · 'offer_attribute' {offerKey,attribute} · 'new_offer' {kind,offer} · 'faq' {question,answer}.",
        }
      }
      const mark: Provenance = update.origin === 'suggested' ? 'suggested_confirmed' : 'stated'
      switch (update.target) {
        case 'page': {
          if (!PAGE_FIELDS.includes(update.field)) {
            return { ok: false, code: 'invalid_field_update', error: `Unknown page field ${String(update.field)}.` }
          }
          draft[update.field] = update.value
          provenance[pageProvenanceKey(update.field)] = mark
          break
        }
        case 'offer': {
          const entry = offerEntries(draft).find((e) => e.key === update.offerKey)
          if (!entry) {
            return { ok: false, code: 'unknown_offer_key', error: `No offer at ${update.offerKey}.` }
          }
          const previousNorm = normalizeOfferName(entry.offer.name)
          const applied = applyOfferField(entry.offer, update)
          if (applied) return applied
          // A rename moves the offer's provenance key base - migrate every
          // existing mark so stated-field protection survives the new name.
          const nextNorm = normalizeOfferName(entry.offer.name)
          if (update.field === 'name' && previousNorm && nextNorm !== previousNorm) {
            const prefix = offerProvenanceKey(previousNorm, '')
            for (const key of Object.keys(provenance)) {
              if (key.startsWith(prefix)) {
                provenance[offerProvenanceKey(nextNorm, key.slice(prefix.length))] = provenance[key]
                delete provenance[key]
              }
            }
          }
          provenance[offerFieldProvenanceKey(entry.offer, update.field)] = mark
          break
        }
        case 'offer_rules': {
          const entry = offerEntries(draft).find((e) => e.key === update.offerKey)
          if (!entry) {
            return { ok: false, code: 'unknown_offer_key', error: `No offer at ${update.offerKey}.` }
          }
          entry.offer.rules = { ...entry.offer.rules, ...update.rules }
          // Only paid pricing/automation rules imply negotiation. Booking,
          // scope, and forward-compatible unknown rules remain core on every plan.
          if (!entry.offer.offerType && hasPaidNegotiationRules(entry.offer)) {
            entry.offer.offerType = 'negotiable'
          }
          provenance[offerFieldProvenanceKey(entry.offer, 'rules')] = mark
          break
        }
        case 'offer_input': {
          const entry = offerEntries(draft).find((e) => e.key === update.offerKey)
          if (!entry) {
            return { ok: false, code: 'unknown_offer_key', error: `No offer at ${update.offerKey}.` }
          }
          const validated = validateOfferInputField(update.input)
          if (!validated.ok) {
            return { ok: false, code: 'invalid_field_update', error: `Invalid offer input: ${validated.error}` }
          }
          const applied = withOfferCustomerInput(entry.offer, validated.value)
          if (!applied.ok) {
            return { ok: false, code: 'invalid_field_update', error: `Invalid offer input: ${applied.error}` }
          }
          Object.assign(entry.offer, applied.value)
          provenance[offerFieldProvenanceKey(entry.offer, `input:${validated.value.key}`)] = mark
          break
        }
        case 'offer_attribute': {
          const entry = offerEntries(draft).find((e) => e.key === update.offerKey)
          if (!entry) {
            return { ok: false, code: 'unknown_offer_key', error: `No offer at ${update.offerKey}.` }
          }
          const validated = validateOfferAttribute(update.attribute)
          if (!validated.ok) {
            return { ok: false, code: 'invalid_field_update', error: `Invalid offer attribute: ${validated.error}` }
          }
          const applied = withOfferAttribute(entry.offer, validated.value)
          if (!applied.ok) {
            return { ok: false, code: 'invalid_field_update', error: `Invalid offer attribute: ${applied.error}` }
          }
          Object.assign(entry.offer, applied.value)
          provenance[offerFieldProvenanceKey(entry.offer, `attribute:${validated.value.key}`)] = mark
          break
        }
        case 'new_offer': {
          const norm = normalizeOfferName(update.offer.name)
          if (!norm) {
            return { ok: false, code: 'invalid_field_update', error: 'A new offer needs a name.' }
          }
          const existing = offerEntries(draft).find((e) => normalizeOfferName(e.offer.name) === norm)
          if (existing) {
            // Replay / restatement of a known offer: merge non-empty scalar fields only.
            // Structured configuration has dedicated targets and cannot be smuggled through new_offer.
            mergeOfferFields(existing.offer, update.offer, provenance, mark)
          } else {
            const target = update.kind === 'products' ? draft.products : draft.services
            const safeOffer = mergeProposedOfferPreservingConfiguration(undefined, update.offer)
            target.push(safeOffer)
            stampOfferProvenanceAs(provenance, safeOffer, mark)
          }
          break
        }
        case 'faq': {
          const q = update.question.trim()
          const a = update.answer.trim()
          if (!q || !a) {
            return { ok: false, code: 'invalid_field_update', error: 'An FAQ needs both a question and an answer.' }
          }
          const norm = normalizeOfferName(q)
          const existing = draft.faqs.find((f) => normalizeOfferName(f.question) === norm)
          if (existing) {
            existing.answer = a
          } else {
            draft.faqs.push({ question: q, answer: a })
          }
          provenance[faqProvenanceKey(q)] = mark
          break
        }
        default:
          // Runtime LLM data can carry any target string - unknown values must
          // reject (teachably), never no-op.
          return {
            ok: false,
            code: 'invalid_field_update',
            error: `Unknown field-update target ${JSON.stringify((update as { target?: unknown }).target)} - use page | offer | offer_rules | offer_input | offer_attribute | new_offer | faq.`,
          }
      }
    }
  }

  return { ok: true, draft, provenance }
}

/** Apply a single offer-field update in place; returns an error outcome or
 *  null on success. */
function applyOfferField(
  offer: OfferItem,
  update: Extract<IntakeFieldUpdate, { target: 'offer' }>,
): { ok: false; code: IntakeErrorCode; error: string } | null {
  switch (update.field) {
    case 'isMobile': {
      offer.isMobile = update.value === true || update.value === 'true' || update.value === '1'
      return null
    }
    case 'offerType': {
      if (update.value !== 'fixed' && update.value !== 'negotiable') {
        return { ok: false, code: 'invalid_field_update', error: `offerType must be fixed or negotiable, got ${String(update.value)}.` }
      }
      offer.offerType = update.value
      // Choosing Fixed is explicit paid-feature cleanup. Preserve ordinary
      // booking/business rules authored on every plan.
      if (update.value === 'fixed') {
        const cleaned = stripPaidNegotiationRules(offer)
        if (cleaned.rules) offer.rules = cleaned.rules
        else delete offer.rules
      }
      return null
    }
    case 'name':
    case 'price':
    case 'description':
    case 'duration':
    case 'serviceArea':
    case 'travelFee':
    case 'url': {
      if (typeof update.value !== 'string') {
        return { ok: false, code: 'invalid_field_update', error: `${update.field} expects a string value.` }
      }
      offer[update.field] = update.value
      return null
    }
    default:
      return { ok: false, code: 'invalid_field_update', error: `Unknown offer field ${String(update.field)}.` }
  }
}

function stampOfferProvenanceAs(provenance: Record<string, Provenance>, offer: OfferItem, mark: Provenance) {
  for (const field of OFFER_PROVENANCE_FIELDS) {
    const value = offer[field]
    if (typeof value === 'string' && value.trim()) {
      provenance[offerFieldProvenanceKey(offer, field)] = mark
    }
  }
  stampOfferConfigurationProvenance(provenance, offer, mark)
}

function mergeOfferFields(
  target: OfferItem,
  incoming: OfferItem,
  provenance: Record<string, Provenance>,
  mark: Provenance,
) {
  for (const field of OFFER_PROVENANCE_FIELDS) {
    const value = incoming[field]
    if (typeof value === 'string' && value.trim()) {
      ;(target as Record<string, unknown>)[field] = value
      provenance[offerFieldProvenanceKey(target, field)] = mark
    }
  }
}

/** propose_offers (spec §5): the LLM may only curate offers that exist in the
 *  extraction pool or were stated by the owner - anything else is invention.
 *  Stated facts survive curation: stated-provenance fields win over proposed
 *  values, and stated offers the proposal omits are retained, not dropped. */
function foldProposedOffers(state: IntakeState, kind: OfferKind, proposed: OfferItem[]): FoldOutcome {
  // The legitimate pool: everything extracted + everything currently in the
  // draft (which only got there via extraction folds or stated answers).
  const pool = new Set<string>()
  for (const extraction of state.extractions) {
    for (const offer of extraction.offers) pool.add(normalizeOfferName(offer.name))
  }
  for (const { offer } of offerEntries(state.draft)) pool.add(normalizeOfferName(offer.name))

  for (const offer of proposed) {
    const norm = normalizeOfferName(offer.name)
    if (!norm || !pool.has(norm)) {
      return {
        ok: false,
        code: 'invented_offer',
        error: `"${offer.name ?? ''}" is not derived from any ingested source or stated answer - the interview never invents offers.`,
      }
    }
  }

  const provenance = { ...state.provenance }
  const currentByName = new Map(offerEntries(state.draft).map((e) => [normalizeOfferName(e.offer.name), e.offer]))

  const nextOffers: OfferItem[] = proposed.map((offer) => {
    const norm = normalizeOfferName(offer.name)
    const existing = currentByName.get(norm)
    const merged: OfferItem = mergeProposedOfferPreservingConfiguration(existing, offer)
    // Stated fields always win over a re-proposal - only a new GapAnswer may
    // change what the owner said.
    if (existing) {
      for (const field of OFFER_PROVENANCE_FIELDS) {
        if (isStatedKey(provenance, offerProvenanceKey(norm, field))) {
          const statedValue = existing[field]
          ;(merged as Record<string, unknown>)[field] = statedValue
        }
      }
      if (existing.rules && isStatedKey(provenance, offerProvenanceKey(norm, 'rules'))) {
        merged.rules = existing.rules
        merged.offerType = existing.offerType ?? merged.offerType
      }
    }
    stampOfferProvenance(provenance, merged, 'imported')
    return merged
  })

  const proposedNames = new Set(nextOffers.map((o) => normalizeOfferName(o.name)))
  // Retain stated offers the proposal silently dropped.
  const retained = state.draft[kind].filter((offer) => {
    const norm = normalizeOfferName(offer.name)
    if (proposedNames.has(norm)) return false
    return isStatedKey(provenance, offerProvenanceKey(norm, 'name'))
  })

  const otherKind: OfferKind = kind === 'services' ? 'products' : 'services'
  // An offer recategorized into `kind` must leave the other array.
  const remainingOther = state.draft[otherKind].filter((offer) => !proposedNames.has(normalizeOfferName(offer.name)))

  const draft: IntakeDraft = {
    ...state.draft,
    [kind]: [...nextOffers, ...retained.map((o) => ({ ...o }))],
    [otherKind]: remainingOther.map((o) => ({ ...o })),
  } as IntakeDraft

  return { ok: true, draft, provenance }
}
