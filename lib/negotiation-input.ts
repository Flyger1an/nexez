/**
 * Caps on untrusted buyer-supplied negotiation input.
 *
 * The buyer controls these free-text fields; they're persisted to the message log
 * AND serialized into the LLM prompt. Capping them at the single route entry point
 * prevents prompt-stuffing / cost + latency blowup (a multi-MB `query`) and bounds
 * what an injection payload can carry. This is hardening, not the security boundary
 * - the price-floor clamp + the `internalNotes` strip are the hard guarantees.
 */

export type BuyerInputFields = {
  query?: string
  timeline?: string
  contact?: string
  budget?: string
  buyerAgent?: string
  requestedTerms?: Record<string, unknown>
}

export type SanitizedBuyerInput = BuyerInputFields & { truncated: boolean }

const STRING_LIMITS = {
  query: 2000,
  timeline: 200,
  contact: 200,
  budget: 100,
  buyerAgent: 120,
} as const

const REQUESTED_TERMS_MAX = 4000
// Strip C0/C1 control chars except tab (0x09), newline (0x0A) and carriage return (0x0D).
// Built from escapes so no literal control bytes live in this source file.
const CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', 'g')
const TRUNCATION_MARKER = ' … [truncated]'

/**
 * Return a cleaned copy of the untrusted fields (control chars stripped, each
 * capped to its limit) plus a `truncated` flag. Only fields present on the input
 * are returned. Pure - no I/O.
 */
export function sanitizeBuyerInput(input: BuyerInputFields): SanitizedBuyerInput {
  let truncated = false
  const out: BuyerInputFields = {}

  for (const key of ['query', 'timeline', 'contact', 'budget', 'buyerAgent'] as const) {
    const raw = input[key]
    if (raw == null) continue
    const cleaned = String(raw).replace(CONTROL_CHARS, '').trim()
    const max = STRING_LIMITS[key]
    if (cleaned.length > max) {
      out[key] = cleaned.slice(0, max) + TRUNCATION_MARKER
      truncated = true
    } else {
      out[key] = cleaned
    }
  }

  if (input.requestedTerms != null) {
    let serialized = ''
    try {
      serialized = JSON.stringify(input.requestedTerms)
    } catch {
      serialized = ''
    }
    if (serialized.length > REQUESTED_TERMS_MAX) {
      out.requestedTerms = { note: '<omitted: oversized requestedTerms>' }
      truncated = true
    } else {
      out.requestedTerms = input.requestedTerms
    }
  }

  return { ...out, truncated }
}
