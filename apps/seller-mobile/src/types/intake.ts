// Seller intake interview — the threads-API contract this app consumes
// (server: app/api/agents/intake/* + lib/agents/intake.ts in the web repo).
// The app is a THIN client (spec §7): no gap logic on device — these types
// mirror only what the screens render and post.

export type IntakeGapKind = 'blocking' | 'quality' | 'opportunity'

export type IntakeGap = {
  id: string
  field: string
  offerKey?: string
  question: string
  why: string
  priority: number
  kind: IntakeGapKind
}

/** Structured quick-answer payload — passed through verbatim; the server
 *  reducer validates every field update. */
export type IntakeGapAnswer = {
  gapId: string
  answer: string
  skipped?: boolean
  fields?: Array<Record<string, unknown>>
}

export type IntakeDraftLite = {
  name: string
  industry: string
  services: unknown[]
  products: unknown[]
  faqs: unknown[]
}

export type IntakeCard =
  | { type: 'source_ingested'; sourceId: string; label: string; offers: number; confidence?: number }
  | { type: 'gap_batch'; gaps: IntakeGap[] }
  | { type: 'draft_summary'; draft: IntakeDraftLite; readiness: number; handoffEligible: boolean }
  | { type: 'handoff'; via: 'agent' | 'owner_exit' }

export type IntakeSessionMessage = {
  id: string
  role: 'owner' | 'agent'
  content: string
  at: string
}

/** The slice of persisted session state the app renders (resume + opening). */
export type IntakeSessionState = {
  phase: 'INGEST' | 'EXTRACT' | 'GAP_ANALYSIS' | 'INTERVIEW' | 'SYNTHESIS' | 'REVIEW_HANDOFF'
  gaps: IntakeGap[]
  messages: IntakeSessionMessage[]
  sources: Array<{ id: string; kind: string; value: string; label?: string }>
  extractions: Array<{ sourceId: string; offers: unknown[]; confidence?: number }>
  /** Present when the session seeded from an existing listing (re-interview). */
  draft?: { name?: string }
}

export type IntakeSessionSummary = { id: string; status: string; phase: string; pageId: string | null; updatedAt: string | null }

export type IntakeTurnResponse = {
  ok: boolean
  message: string
  cards: IntakeCard[]
  phase: IntakeSessionState['phase']
  state: IntakeSessionState
}

export type IntakeCommitResponse = {
  ok: boolean
  pageId: string
  slug: string | null
  alreadyCommitted: boolean
  builderPath: string
}
