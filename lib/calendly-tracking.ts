// Two ends of one contract, deliberately co-located so they can't drift:
//
//  1. tagCalendlyTracking() stamps a negotiation's Calendly scheduling link with
//     `utm_content=nz_neg_<id>` before it reaches the buyer's agent.
//  2. parseNegotiationTracking() reads that value back off the Calendly
//     invitee.created webhook's `tracking` field to recover the negotiation id.
//
// This gives cancel-on-refund an EXACT booking↔negotiation link (Calendly echoes
// the utm value on the booking) instead of a fuzzy buyer-email guess that could
// cancel the wrong person's meeting. Non-Calendly links are left untouched — the
// round-trip only works through Calendly's tracking passthrough.

const PREFIX = 'nz_neg_'

function isCalendlyHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return h === 'calendly.com' || h.endsWith('.calendly.com')
}

/**
 * Tag a Calendly scheduling link with the negotiation id (via utm_content) so a
 * later booking is linkable back to this negotiation. Returns the link unchanged
 * when it isn't a Calendly URL, when the id is missing, or when the URL can't be
 * parsed — this is a best-effort enhancement, never a gate.
 */
export function tagCalendlyTracking(
  link: string | null | undefined,
  negotiationId: string | null | undefined,
): string | undefined {
  if (!link) return link ?? undefined
  if (!negotiationId) return link
  try {
    const u = new URL(link)
    if (!isCalendlyHost(u.hostname)) return link
    // Don't clobber a utm_content the owner intentionally set to something else;
    // only stamp when it's absent or already one of ours.
    const existing = u.searchParams.get('utm_content')
    if (existing && !existing.startsWith(PREFIX)) return link
    u.searchParams.set('utm_content', `${PREFIX}${negotiationId}`)
    return u.toString()
  } catch {
    return link
  }
}

/**
 * Recover the negotiation id from a Calendly webhook's tracking.utm_content, or
 * null when it isn't one of ours. Trims to guard against stray whitespace and
 * rejects the bare prefix (empty id).
 */
export function parseNegotiationTracking(utmContent: unknown): string | null {
  if (typeof utmContent !== 'string') return null
  const v = utmContent.trim()
  if (!v.startsWith(PREFIX)) return null
  const id = v.slice(PREFIX.length)
  return id || null
}
