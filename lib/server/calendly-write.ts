import 'server-only'
import type { BusyPeriod } from '../integrations'

// PAT-powered Calendly write/query operations (the write-side that the stored
// per-page Calendly credential unlocks). The raw PAT comes from
// getCalendlyPat() and is used ONLY here to call Calendly's API — never logged,
// never returned. All calls are bounded (9s) and fail soft (null / false).

const CALENDLY_API = 'https://api.calendly.com'
const TIMEOUT_MS = 9000
// Calendly's /user_busy_times allows at most a 7-day window per request.
const MAX_BUSY_DAYS = 7

function withTimeout(): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  return { signal: controller.signal, done: () => clearTimeout(timer) }
}

export type CalendlyUser = { ok: true; uri: string } | { ok: false; reason: 'invalid' | 'unknown' }

/**
 * Verify a Calendly PAT and resolve the user URI. `invalid` = Calendly rejected
 * the token (401/403) — a definitive bad token. `unknown` = network/other error
 * (Calendly unreachable) — the token might be fine, so callers should not treat
 * this as a rejection.
 */
export async function getCalendlyUser(pat: string): Promise<CalendlyUser> {
  const t = withTimeout()
  try {
    const res = await fetch(`${CALENDLY_API}/users/me`, {
      headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
      signal: t.signal,
    })
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'invalid' }
    if (!res.ok) return { ok: false, reason: 'unknown' }
    const data = await res.json()
    const uri = data?.resource?.uri
    return typeof uri === 'string' && uri ? { ok: true, uri } : { ok: false, reason: 'unknown' }
  } catch {
    return { ok: false, reason: 'unknown' }
  } finally {
    t.done()
  }
}

/**
 * Fetch the seller's real busy periods from Calendly (their scheduled events +
 * external calendar blocks) over the next `days` (clamped to Calendly's 7-day
 * cap). Returns BusyPeriod[] for deriveAvailabilityWindows, or null on any
 * failure (so the caller leaves availability untouched rather than blanking it).
 */
export async function fetchCalendlyBusy(pat: string, opts: { days?: number; now?: Date } = {}): Promise<BusyPeriod[] | null> {
  const user = await getCalendlyUser(pat)
  if (!user.ok) return null

  const now = opts.now ?? new Date()
  const days = Math.min(Math.max(1, opts.days ?? MAX_BUSY_DAYS), MAX_BUSY_DAYS)
  const start = new Date(now.getTime() + 60_000) // Calendly requires start_time slightly in the future
  const end = new Date(now.getTime() + days * 86_400_000)

  const t = withTimeout()
  try {
    const params = new URLSearchParams({ user: user.uri, start_time: start.toISOString(), end_time: end.toISOString() })
    const res = await fetch(`${CALENDLY_API}/user_busy_times?${params.toString()}`, {
      headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
      signal: t.signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    const collection = Array.isArray(data?.collection) ? data.collection : []
    return collection
      .map((b: { start_time?: string; end_time?: string }) => ({ start: b.start_time ?? '', end: b.end_time ?? '' }))
      .filter((b: BusyPeriod) => b.start && b.end)
  } catch {
    return null
  } finally {
    t.done()
  }
}

/**
 * Cancel a Calendly scheduled event by its UUID (write-side: keeps the calendar
 * in sync when a Nexez booking/negotiation is cancelled or refunded). Returns
 * true only on a confirmed cancellation. Best-effort; never throws.
 */
export async function cancelCalendlyEvent(pat: string, eventUuid: string, reason = 'Cancelled via Nexez'): Promise<boolean> {
  if (!eventUuid) return false
  const t = withTimeout()
  try {
    const res = await fetch(`${CALENDLY_API}/scheduled_events/${encodeURIComponent(eventUuid)}/cancellation`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
      signal: t.signal,
    })
    return res.ok
  } catch {
    return false
  } finally {
    t.done()
  }
}

/** The Calendly scheduled-event UUID from an event URI
 *  (…/scheduled_events/<uuid>), or null. Used to bridge a stored provider_url
 *  to cancelCalendlyEvent. */
export function calendlyEventUuid(eventUri: string | null | undefined): string | null {
  if (!eventUri) return null
  // Calendly event UUIDs are alphanumeric (base32-like), not hex.
  const match = eventUri.match(/scheduled_events\/([A-Za-z0-9-]{16,})(?:\/|$|\?)/)
  return match ? match[1]! : null
}
