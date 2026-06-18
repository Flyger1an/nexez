// Optional buyer identity an agent (or the on-page form) can declare at checkout so
// the seller knows WHO is buying and the buyer gets a receipt + order-portal access —
// instead of the only signal being whatever email Stripe collected on its hosted page.
//
// Pure + tested; shared by the direct-checkout route and the negotiation pay route.
// Every value is sanitized before it reaches Stripe (customer_email / metadata) or our
// DB: control chars (incl. newlines → metadata/line injection) stripped, length-capped
// well under Stripe's 500-char metadata limit, email shape-validated.

const EMAIL_MAX = 254 // RFC 5321 practical max
const NAME_MAX = 200
const REFERENCE_MAX = 200
const AGENT_MAX = 120

// Pragmatic shape check — just enough to reject garbage before Stripe (which rejects
// malformed customer_email anyway). Not a full RFC 5322 validation.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function clean(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  // Strip control chars (code < 0x20 incl. tab/newline → metadata/line injection, plus
  // DEL 0x7f). Written as code-point comparisons so no literal control byte lives in
  // source (which editors silently mangle).
  let out = ''
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) continue
    out += ch
  }
  out = out.trim()
  return out ? out.slice(0, max) : null
}

export type BuyerIdentity = {
  email: string | null
  name: string | null
  reference: string | null
  agent: string | null
}

/** Validate + normalize the optional buyer-identity fields from a checkout/pay request. */
export function parseBuyerIdentity(raw: {
  buyerEmail?: unknown
  buyerName?: unknown
  buyerReference?: unknown
  buyerAgent?: unknown
}): BuyerIdentity {
  const emailRaw = clean(raw.buyerEmail, EMAIL_MAX)
  return {
    // Lowercased so the declared email matches the order-portal "find my orders" lookup.
    email: emailRaw && EMAIL_RE.test(emailRaw) ? emailRaw.toLowerCase() : null,
    name: clean(raw.buyerName, NAME_MAX),
    reference: clean(raw.buyerReference, REFERENCE_MAX),
    agent: clean(raw.buyerAgent, AGENT_MAX),
  }
}

export function hasBuyerIdentity(b: BuyerIdentity): boolean {
  return Boolean(b.email || b.name || b.reference || b.agent)
}

/** The nexez_buyer_* Stripe session metadata entries (only the present fields). */
export function buyerMetadata(b: BuyerIdentity): Record<string, string> {
  const m: Record<string, string> = {}
  if (b.email) m.nexez_buyer_email = b.email
  if (b.name) m.nexez_buyer_name = b.name
  if (b.reference) m.nexez_buyer_reference = b.reference
  if (b.agent) m.nexez_buyer_agent = b.agent
  return m
}
