// Allowlist for scheduling/booking links that a negotiation decision may surface.
//
// The negotiation LLM can emit a `schedulingLink` on a counter/accept. The
// agent-facing /negotiate/[id] page renders it as a clickable <a href>. Without a
// host allowlist, a prompt injection could plant an attacker URL (phishing) there.
// The price-floor clamp and internalNotes strip already neutralize the money/secret
// paths; this closes the rendered-link path by trusting only known providers (or the
// owner's own configured offer link, which is owner-set — not LLM-emitted).

const ALLOWED_SCHEDULING_HOSTS = [
  'calendly.com',
  'cal.com',
  'acuityscheduling.com',
  'squareup.com',
  'square.site',
  'youcanbook.me',
  'savvycal.com',
  'tidycal.com',
  'koalendar.com',
  'zcal.co',
  'simplybook.me',
  'setmore.com',
  'calendar.google.com',
  'outlook.office365.com',
  'hubspot.com',
]

function hostOf(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return u.host.toLowerCase()
  } catch {
    return null
  }
}

/** True when `url` is an http(s) URL whose host is a known provider (or an extra allowed host). */
export function isAllowedSchedulingUrl(url: string | null | undefined, extraAllowedHosts: string[] = []): boolean {
  const host = hostOf(url)
  if (!host) return false
  const allowed = [...ALLOWED_SCHEDULING_HOSTS, ...extraAllowedHosts.map((h) => h.toLowerCase()).filter(Boolean)]
  return allowed.some((a) => host === a || host.endsWith(`.${a}`))
}

/**
 * Sanitize a scheduling link that may have been emitted by the negotiation LLM.
 * Returns `candidate` only if it points at a known provider (or the owner-configured
 * link's host). Otherwise falls back to the owner-configured link (trusted, owner-set)
 * or `undefined`.
 */
export function sanitizeSchedulingLink(
  candidate: string | null | undefined,
  ownerLink?: string | null,
): string | undefined {
  const ownerHost = hostOf(ownerLink)
  if (isAllowedSchedulingUrl(candidate, ownerHost ? [ownerHost] : [])) return candidate as string
  return ownerLink || undefined
}
