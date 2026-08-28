import 'server-only'
import type { BusyPeriod, DerivedWindow } from '../integrations'

// Calendly write/query operations. The caller resolves a managed OAuth access
// token or a legacy personal token, then passes it only to these bounded API
// calls. Credentials are never logged or returned to a browser.

const CALENDLY_API = 'https://api.calendly.com'
const TIMEOUT_MS = 9000
// Calendly's /user_busy_times allows at most a 7-day window per request.
const MAX_BUSY_DAYS = 7

function withTimeout(ms: number = TIMEOUT_MS): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, done: () => clearTimeout(timer) }
}

// A freshly-minted single-use link sits in the buyer's checkout redirect path, so
// give it a tighter budget than the background (9s) calls - fall back to the
// reusable link quickly rather than making the buyer wait on Calendly.
const LINK_TIMEOUT_MS = 6000

export type CalendlyUser = { ok: true; uri: string; timeZone: string } | { ok: false; reason: 'invalid' | 'unknown' }

export type CalendlyEventTypeRef = {
  uri: string
  durationMinutes: number
}

export type CalendlyEventTypeAvailability = {
  windows: DerivedWindow[]
  availabilityByEventType: Record<string, 'available' | 'sold_out'>
  complete: boolean
  timeZone: string
}

const DEFAULT_TIME_ZONE = 'UTC'
const MAX_EVENT_TYPES = 25

function validTimeZone(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return DEFAULT_TIME_ZONE
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format()
    return value
  } catch {
    return DEFAULT_TIME_ZONE
  }
}

/**
 * Verify a Calendly PAT and resolve the user URI. `invalid` = Calendly rejected
 * the token (401/403) - a definitive bad token. `unknown` = network/other error
 * (Calendly unreachable) - the token might be fine, so callers should not treat
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
    return typeof uri === 'string' && uri
      ? { ok: true, uri, timeZone: validTimeZone(data?.resource?.timezone) }
      : { ok: false, reason: 'unknown' }
  } catch {
    return { ok: false, reason: 'unknown' }
  } finally {
    t.done()
  }
}

function zonedParts(value: Date, timeZone: string): { date: string; time: string; weekday: string; labelTime: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  const hour = part('hour')
  const minute = part('minute')
  const labelTime = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(value)
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    time: `${hour}:${minute}`,
    weekday: part('weekday'),
    labelTime,
  }
}

function availableTimesToWindows(
  slots: Array<{ startTime: string; durationMinutes: number }>,
  timeZone: string,
  max = 6,
): DerivedWindow[] {
  const seen = new Set<string>()
  const windows: DerivedWindow[] = []
  for (const slot of slots.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))) {
    const start = new Date(slot.startTime)
    if (!Number.isFinite(start.getTime()) || seen.has(start.toISOString())) continue
    seen.add(start.toISOString())
    const durationMinutes = Number.isFinite(slot.durationMinutes) && slot.durationMinutes > 0
      ? Math.min(slot.durationMinutes, 24 * 60)
      : 30
    const end = new Date(start.getTime() + durationMinutes * 60_000)
    const startParts = zonedParts(start, timeZone)
    const endParts = zonedParts(end, timeZone)
    windows.push({
      date: startParts.date,
      start: startParts.time,
      end: endParts.time,
      label: `${startParts.weekday} ${startParts.labelTime}–${endParts.labelTime}`,
      time_zone: timeZone,
    })
    if (windows.length >= max) break
  }
  return windows
}

/**
 * Ask Calendly for the event type's actual bookable times. Unlike subtracting
 * busy blocks from guessed 9–5 hours, this endpoint already applies the owner's
 * configured schedule, timezone, date overrides, buffers, and booking rules.
 *
 * Successful event types are returned independently so a partial upstream
 * failure never marks an unverified offer sold out. `null` means no event type
 * could be verified and callers must leave all published availability untouched.
 */
export async function fetchCalendlyEventTypeAvailability(
  pat: string,
  refs: CalendlyEventTypeRef[],
  opts: { days?: number; now?: Date; maxWindows?: number } = {},
): Promise<CalendlyEventTypeAvailability | null> {
  const unique = new Map<string, CalendlyEventTypeRef>()
  let truncated = false
  for (const ref of refs) {
    if (!isCalendlyEventTypeUri(ref.uri) || unique.has(ref.uri)) continue
    if (unique.size >= MAX_EVENT_TYPES) {
      truncated = true
      continue
    }
    unique.set(ref.uri, ref)
  }
  if (!unique.size) return null

  const user = await getCalendlyUser(pat)
  if (!user.ok) return null

  const now = opts.now ?? new Date()
  const days = Math.min(Math.max(1, opts.days ?? MAX_BUSY_DAYS), MAX_BUSY_DAYS)
  const start = new Date(now.getTime() + 60_000)
  // Stay just inside Calendly's inclusive seven-day limit.
  const end = new Date(start.getTime() + days * 86_400_000 - 1_000)
  const entries = [...unique.values()]
  const responses = await Promise.all(entries.map(async (ref) => {
    const t = withTimeout()
    try {
      const params = new URLSearchParams({
        event_type: ref.uri,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      })
      const res = await fetch(`${CALENDLY_API}/event_type_available_times?${params.toString()}`, {
        headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
        signal: t.signal,
      })
      if (!res.ok) return { ref, slots: null }
      const data = await res.json()
      const collection = Array.isArray(data?.collection) ? data.collection : []
      const slots = collection
        .filter((slot: { status?: string }) => !slot.status || slot.status === 'available')
        .map((slot: { start_time?: string }) => ({
          startTime: slot.start_time ?? '',
          durationMinutes: ref.durationMinutes,
        }))
        .filter((slot: { startTime: string }) => Number.isFinite(Date.parse(slot.startTime)))
      return { ref, slots }
    } catch {
      return { ref, slots: null }
    } finally {
      t.done()
    }
  }))

  const availabilityByEventType: Record<string, 'available' | 'sold_out'> = {}
  const availableSlots: Array<{ startTime: string; durationMinutes: number }> = []
  let failures = 0
  for (const response of responses) {
    if (response.slots === null) {
      failures += 1
      continue
    }
    availabilityByEventType[response.ref.uri] = response.slots.length ? 'available' : 'sold_out'
    availableSlots.push(...response.slots)
  }
  if (Object.keys(availabilityByEventType).length === 0) return null

  return {
    windows: availableTimesToWindows(availableSlots, user.timeZone, opts.maxWindows),
    availabilityByEventType,
    complete: failures === 0 && !truncated,
    timeZone: user.timeZone,
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

// A stored event-type URI must be a real Calendly event_types resource before we
// hand it to the API as a scheduling-link owner. Guards against a malformed /
// tampered offer.metadata value (defence in depth - it originates from the
// seller's own import, and is only ever sent as a body param to the pinned host).
function isCalendlyEventTypeUri(uri: string): boolean {
  return /^https:\/\/api\.calendly\.com\/event_types\/[A-Za-z0-9-]+$/.test(uri)
}

/**
 * Mint a SINGLE-USE Calendly scheduling link for an event type. Each link is good
 * for exactly one booking (max_event_count: 1), so the reusable public scheduling
 * URL is never shared/re-bookable from a checkout redirect. Returns the one-time
 * booking_url, or null on any failure (caller falls back to the reusable link).
 */
export async function createCalendlySchedulingLink(pat: string, eventTypeUri: string): Promise<string | null> {
  if (!eventTypeUri || !isCalendlyEventTypeUri(eventTypeUri)) return null
  const t = withTimeout(LINK_TIMEOUT_MS)
  try {
    const res = await fetch(`${CALENDLY_API}/scheduling_links`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_event_count: 1, owner: eventTypeUri, owner_type: 'EventType' }),
      signal: t.signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    const url = data?.resource?.booking_url
    return typeof url === 'string' && url ? url : null
  } catch {
    return null
  } finally {
    t.done()
  }
}
