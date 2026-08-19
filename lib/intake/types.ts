// Seller intake interview - pure domain types.
// Spec: nexez-intake-interview-spec.md. The interview is a platform capability:
// this module (and its siblings gaps.ts / reducer.ts) is pure + framework-free
// (same discipline as lib/editor-merge.ts) - no I/O, no Date.now(), no LLM.
// Timestamps and ids always arrive via action payloads so the reducer is
// deterministic and resumable.
import type { FaqItem, OfferItem, OfferKind } from '../agent-page'
import type { OfferAttribute, OfferInputField } from '../offer-configuration'
import type { ImportClarifyingQuestion } from '../importer'

/** The interview state machine (spec §3). GAP_ANALYSIS and SYNTHESIS are real,
 *  persisted phases - the LLM cannot skip them because the reducer validates
 *  every action against the current phase. */
export type IntakePhase =
  | 'INGEST'
  | 'EXTRACT'
  | 'GAP_ANALYSIS'
  | 'INTERVIEW'
  | 'SYNTHESIS'
  | 'REVIEW_HANDOFF'

/** Where a fact on the working draft came from (spec §2.1 - never invent).
 *  - imported: sourced from ingestion (site crawl, integration, pasted text, existing page)
 *  - stated: the owner said it in the interview (always via a recorded GapAnswer)
 *  - suggested_confirmed: the agent suggested it and the owner explicitly confirmed */
export type Provenance = 'imported' | 'stated' | 'suggested_confirmed'

export type IntakeSourceKind = 'url' | 'integration' | 'text' | 'none'

export type IntakeSource = {
  id: string
  kind: IntakeSourceKind
  /** URL / integration id / raw text. Empty for kind 'none' ("starting from scratch"). */
  value: string
  label?: string
  addedAt: string // ISO - stamped by the caller, never inside the reducer
}

/** The rich extraction result stored per source (spec §3 EXTRACT). A trimmed,
 *  serializable projection of ImportResult - native OfferItem[] throughout. */
export type IntakeExtraction = {
  sourceId: string
  title?: string | null
  description?: string | null
  website_url?: string | null
  offers: OfferItem[]
  faqs?: FaqItem[] | null
  industry?: string | null
  audience?: string | null
  location?: string | null
  contact_email?: string | null
  cta_label?: string | null
  cta_url?: string | null
  clarifyingQuestions?: ImportClarifyingQuestion[] | null
  confidence?: number
}

export type GapKind = 'blocking' | 'quality' | 'opportunity'

/** A prioritized question the interview may ask (spec §3 GAP_ANALYSIS).
 *  Ids are stable + deterministic (`page:name`, `offer:services-0:price`,
 *  `imp:<importer id>`, `ind:<expectation key>`) so answers can reference them
 *  across turns and re-analysis converges. */
export type Gap = {
  id: string
  field: string
  offerKey?: string
  question: string
  why: string
  priority: number
  kind: GapKind
}

/** A structured update the LLM mapped out of a free-form owner answer.
 *  `origin: 'suggested'` marks a value the agent proposed and the owner
 *  confirmed → provenance 'suggested_confirmed' instead of 'stated'. */
export type IntakeFieldUpdate =
  | { target: 'page'; field: IntakePageField; value: string; origin?: 'suggested' }
  | { target: 'offer'; offerKey: string; field: IntakeOfferField; value: string | boolean; origin?: 'suggested' }
  | { target: 'offer_rules'; offerKey: string; rules: NonNullable<OfferItem['rules']>; origin?: 'suggested' }
  | { target: 'offer_input'; offerKey: string; input: OfferInputField; origin?: 'suggested' }
  | { target: 'offer_attribute'; offerKey: string; attribute: OfferAttribute; origin?: 'suggested' }
  | { target: 'new_offer'; kind: OfferKind; offer: OfferItem; origin?: 'suggested' }
  | { target: 'faq'; question: string; answer: string; origin?: 'suggested' }

export type IntakePageField =
  | 'name'
  | 'description'
  | 'website_url'
  | 'cta_url'
  | 'cta_label'
  | 'audience'
  | 'location'
  | 'contact_email'
  | 'industry'

export type IntakeOfferField =
  | 'name'
  | 'price'
  | 'description'
  | 'duration'
  | 'serviceArea'
  | 'travelFee'
  | 'isMobile'
  | 'url'
  | 'offerType'

/** An owner answer to a gap. `gapId` must reference a known gap, or carry the
 *  `volunteered:` prefix for facts the owner offered unprompted - this is what
 *  keeps the provenance invariant structural: a field can only become
 *  'stated' / 'suggested_confirmed' through a recorded GapAnswer. */
export type GapAnswer = {
  gapId: string
  /** The owner's words (or a faithful paraphrase) - kept for provenance review. */
  answer: string
  skipped?: boolean
  fields?: IntakeFieldUpdate[]
}

export const VOLUNTEERED_PREFIX = 'volunteered:'

export type IntakeMessage = {
  id: string
  role: 'owner' | 'agent'
  content: string
  at: string // ISO - stamped by the caller, never inside the reducer
}

/** The working draft - native objects only (spec §2.2 / §9). Serialization to
 *  the pipe format happens once, at commit, outside this module. */
export type IntakeDraft = {
  name: string
  description: string
  website_url: string
  cta_url: string
  cta_label: string
  audience: string
  location: string
  contact_email: string
  industry: string
  services: OfferItem[]
  products: OfferItem[]
  faqs: FaqItem[]
}

export type IntakeHandoff = {
  via: 'agent' | 'owner_exit'
  at: string
}

/** The full session state - everything the API persists into
 *  intake_sessions.state (spec §4). */
export type IntakeState = {
  phase: IntakePhase
  sources: IntakeSource[]
  extractions: IntakeExtraction[]
  /** Current askable gaps: recomputed after every mutation, already filtered of
   *  skipped gaps, satisfied coverage, and answered one-shot questions. */
  gaps: Gap[]
  /** Gap ids the agent has asked (batches flattened, in order). */
  askedGapIds: string[]
  /** Every recorded answer, deduped by gapId (a re-answer replaces). */
  answers: GapAnswer[]
  draft: IntakeDraft
  /** Field path → provenance. Keys: `page:<field>` / `offer:<offerKey>:<field>`
   *  / `offer:<offerKey>:input:<stable-key>` / `offer:<offerKey>:attribute:<stable-key>`
   *  / `faq:<n>` - see provenanceKey(). */
  provenance: Record<string, Provenance>
  messages: IntakeMessage[]
  handoff: IntakeHandoff | null
}

export type IntakeAction =
  | { type: 'ADD_SOURCE'; source: IntakeSource }
  | { type: 'RECORD_EXTRACTION'; extraction: IntakeExtraction }
  | { type: 'ANALYZE_GAPS' }
  | { type: 'ASK_GAPS'; gapIds: string[]; message?: IntakeMessage }
  | { type: 'RECORD_ANSWERS'; answers: GapAnswer[]; message?: IntakeMessage }
  | { type: 'PROPOSE_OFFERS'; kind: OfferKind; offers: OfferItem[] }
  | { type: 'ADD_MESSAGE'; message: IntakeMessage }
  | { type: 'REQUEST_HANDOFF'; at: string; message?: IntakeMessage }
  | { type: 'EXIT_TO_BUILDER'; at: string }

export type IntakeErrorCode =
  | 'invalid_phase'
  | 'no_sources'
  | 'unknown_source'
  | 'unknown_gap'
  | 'gap_batch_too_large'
  | 'empty_gap_batch'
  | 'invented_offer'
  | 'unknown_offer_key'
  | 'invalid_field_update'
  | 'blocking_gaps_remain'
  | 'already_handed_off'

/** Discriminated result - same shape discipline as resolveFeatureOwner. The
 *  reducer never throws: routes surface `error` to the LLM / client and the
 *  prior state stays authoritative. */
export type IntakeApplyResult =
  | { ok: true; state: IntakeState }
  | { ok: false; code: IntakeErrorCode; error: string }

/** Provenance key helpers - one canonical spelling, used by reducer + tests. */
export function pageProvenanceKey(field: IntakePageField): string {
  return `page:${field}`
}

export function offerProvenanceKey(offerKey: string, field: string): string {
  return `offer:${offerKey}:${field}`
}
