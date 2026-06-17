import { AgentPage, CheckoutOffer, getBaseUrl, getCheckoutOfferKey } from './agent-page'

// Lifecycle for agent-to-agent negotiations. Kept in one place so the owner
// inbox UI, the public/agent manifests, and tests all share the same truth.
export const NEGOTIATION_STATUSES = [
  'negotiation',
  'agreement_proposed',
  'held',
  'complete',
  'declined',
  'expired',
  // Burst 2: post-settlement reversals (owner refund, or a buyer chargeback).
  'refunded',
  'disputed',
] as const

export type NegotiationStatus = (typeof NEGOTIATION_STATUSES)[number]

export type NegotiationEscrowMode =
  | 'not_configured'
  | 'manual_capture_ready'
  | 'manual_capture_created'
  | 'captured'

export type AgentNegotiation = {
  id: string
  page_id: string
  owner_id: string | null
  slug: string
  offer_key: string
  offer_name: string
  offer_kind: 'services' | 'products'
  buyer_agent: string | null
  buyer_query: string | null
  requested_terms: Record<string, unknown> | null
  budget_text: string | null
  timeline_text: string | null
  contact: string | null
  status: NegotiationStatus
  escrow_mode: NegotiationEscrowMode
  amount_cents: number | null
  currency: string
  /** Cumulative amount refunded so far, Stripe smallest-unit (0 = none). Caps in-app
   *  partial refunds + keys their idempotency; reconciled from charge.amount_refunded. */
  refunded_cents: number
  stripe_payment_intent_id: string | null
  /** Hybrid settlement path once an agreement is reached (Burst 1). */
  settlement_state: 'auto' | 'awaiting_approval' | 'approved' | null
  /** Cached buyer Checkout session for idempotent pay links. */
  stripe_checkout_session_id: string | null
  metadata: Record<string, unknown> | null
  /** Continuation credential. Owner-only field — used to build the owner's own
   * persistent-thread link (the agent runtime is cookie-isolated, so that link
   * authenticates by token, not session). Never render it. */
  status_token: string | null
  created_at: string
  updated_at: string
}

const STATUS_LABELS: Record<NegotiationStatus, string> = {
  negotiation: 'New proposal',
  agreement_proposed: 'Agreement proposed',
  held: 'Funds held (escrow)',
  complete: 'Complete',
  declined: 'Declined',
  expired: 'Expired',
  refunded: 'Refunded',
  disputed: 'Disputed (chargeback)',
}

const TERMINAL_STATUSES: NegotiationStatus[] = ['complete', 'declined', 'expired', 'refunded', 'disputed']

export function getNegotiationStatusLabel(status: NegotiationStatus): string {
  return STATUS_LABELS[status] ?? status
}

/**
 * Humanize a requested-terms key (camelCase / snake_case / kebab → "Sentence
 * case") to match the surrounding field labels (e.g. "Buyer agent", "Timeline").
 */
export function humanizeTermKey(key: string): string {
  const spaced = String(key)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  // Whitespace/punctuation-only keys collapse to '' — caller substitutes a label.
  if (!spaced) return ''
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function formatTermValue(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'string') return value.trim() || '—'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    const parts = value.map(formatTermValue).filter((p) => p && p !== '—')
    return parts.length ? parts.join(', ') : '—'
  }
  if (typeof value === 'object') {
    const parts = Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => `${humanizeTermKey(k)}: ${formatTermValue(v)}`,
    )
    return parts.length ? parts.join('; ') : '—'
  }
  return String(value)
}

/**
 * Turn buyer-submitted `requested_terms` into readable label/value rows for the
 * owner inbox + receipt — instead of dumping raw `JSON.stringify` at the human.
 * Pure + client-safe; React escapes the values, so this carries no injection
 * risk. Input is `unknown` on purpose: it's buyer-controlled raw JSON stored in a
 * JSONB column, so while it's *usually* an object it can also arrive as an array
 * or bare primitive — those are surfaced under a single "Terms" row rather than
 * silently dropped. The form-fallback shape `{ note: "<raw text>" }` (set when a
 * buyer posts non-JSON terms) renders as a single "Note" row.
 */
export function formatRequestedTerms(terms: unknown): { label: string; value: string }[] {
  if (terms == null) return []
  if (Array.isArray(terms) || typeof terms !== 'object') {
    const value = formatTermValue(terms)
    return value === '—' ? [] : [{ label: 'Terms', value }]
  }
  return Object.entries(terms as Record<string, unknown>).map(([key, value]) => ({
    label: humanizeTermKey(key) || 'Term',
    value: formatTermValue(value),
  }))
}

/**
 * True when a Postgres/PostgREST error means the table hasn't been migrated yet
 * (relation does not exist / not in the schema cache) — as opposed to a
 * transient load failure. Lets the inbox show "apply migration" guidance
 * instead of a generic error for a not-yet-migrated project.
 */
export function isMissingTableError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!error) return false
  const code = error.code || ''
  const msg = (error.message || '').toLowerCase()
  return (
    code === '42P01' || // Postgres: undefined_table
    code === 'PGRST205' || // PostgREST: table not found in schema cache
    msg.includes('does not exist') ||
    msg.includes('could not find the table') ||
    msg.includes('schema cache')
  )
}

// Tone keys map to badge styling in the UI; kept abstract so styling stays
// in the component layer.
export function getNegotiationStatusTone(
  status: NegotiationStatus,
): 'open' | 'progress' | 'success' | 'muted' {
  if (status === 'negotiation') return 'open'
  if (status === 'agreement_proposed' || status === 'held') return 'progress'
  if (status === 'complete') return 'success'
  return 'muted'
}

export function isTerminalNegotiationStatus(status: NegotiationStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

// What the seller can move a negotiation to next. `held` requires a working
// escrow (Stripe configured) so we never offer it as a no-op.
export function getAllowedNegotiationTransitions(
  status: NegotiationStatus,
  opts: { escrowAvailable?: boolean } = {},
): NegotiationStatus[] {
  const escrowAvailable = Boolean(opts.escrowAvailable)

  switch (status) {
    case 'negotiation':
      return ['agreement_proposed', 'declined']
    case 'agreement_proposed':
      return [...(escrowAvailable ? (['held'] as NegotiationStatus[]) : []), 'complete', 'declined']
    case 'held':
      return ['complete', 'declined']
    default:
      // complete / declined / expired are terminal
      return []
  }
}

export function canTransitionNegotiation(
  from: NegotiationStatus,
  to: NegotiationStatus,
  opts: { escrowAvailable?: boolean } = {},
): boolean {
  return getAllowedNegotiationTransitions(from, opts).includes(to)
}

export type NegotiationSummary = {
  total: number
  open: number
  proposed: number
  held: number
  complete: number
  declined: number
}

export function summarizeNegotiations(list: Pick<AgentNegotiation, 'status'>[]): NegotiationSummary {
  const summary: NegotiationSummary = {
    total: list.length,
    open: 0,
    proposed: 0,
    held: 0,
    complete: 0,
    declined: 0,
  }

  for (const item of list) {
    if (item.status === 'negotiation') summary.open += 1
    else if (item.status === 'agreement_proposed') summary.proposed += 1
    else if (item.status === 'held') summary.held += 1
    else if (item.status === 'complete') summary.complete += 1
    else if (
      item.status === 'declined' ||
      item.status === 'expired' ||
      item.status === 'refunded' ||
      item.status === 'disputed'
    )
      summary.declined += 1
  }

  return summary
}

export function formatNegotiationAmount(
  amountCents: number | null | undefined,
  currency = 'usd',
): string {
  if (amountCents == null || Number.isNaN(amountCents)) return 'Open / to be agreed'

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: 2,
    }).format(amountCents / 100)
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`
  }
}

export function buildNegotiationAction(page: AgentPage, offer: CheckoutOffer, baseUrl = getBaseUrl()) {
  const offerKey = getCheckoutOfferKey(offer.kind, offer.index)

  return {
    method: 'POST',
    endpoint: `${baseUrl}/api/negotiations`,
    content_type: 'application/json',
    body: {
      slug: page.slug,
      offer: offerKey,
      buyerAgent: '{agent_name}',
      query: '{buyer_request}',
      requestedTerms: {
        scope: '{desired_scope}',
        constraints: '{constraints_or_requirements}',
      },
      budget: '{budget_or_range}',
      timeline: '{desired_timeline}',
      contact: '{buyer_or_agent_contact}',
    },
    dry_run_body: {
      slug: page.slug,
      offer: offerKey,
      dryRun: true,
    },
    states: ['negotiation', 'agreement_proposed', 'held', 'complete'],
    escrow_note: 'Escrow is manual-capture Stripe-ready when STRIPE_SECRET_KEY is configured; otherwise proposals are stored for seller review.',
    // Smart Rules Phase 1: the POST response returns a one-time statusToken +
    // statusUrl. Poll this endpoint for "under review" → "agreement proposed" → … updates.
    status_check: {
      method: 'GET',
      endpoint: `${baseUrl}/api/negotiations/status?id={negotiation_id}&token={status_token}`,
      note: 'id and token are returned once in the create response (statusUrl is pre-built). Proposals matching the seller\'s rules may auto-accept to agreement_proposed.',
    },
  }
}
