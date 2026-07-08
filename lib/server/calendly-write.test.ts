import { describe, it, expect, vi, afterEach } from 'vitest'
import { getCalendlyUser, fetchCalendlyBusy, cancelCalendlyEvent, calendlyEventUuid, createCalendlySchedulingLink } from './calendly-write'

const res = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body }) as any
const now = new Date('2026-07-08T12:00:00Z')

afterEach(() => vi.unstubAllGlobals())

describe('getCalendlyUser', () => {
  it('resolves the user URI on a valid token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res({ resource: { uri: 'https://api.calendly.com/users/U1' } })))
    expect(await getCalendlyUser('pat')).toEqual({ ok: true, uri: 'https://api.calendly.com/users/U1' })
  })
  it('401/403 → invalid (definitive bad token)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res({}, false, 401)))
    expect(await getCalendlyUser('bad')).toEqual({ ok: false, reason: 'invalid' })
    vi.stubGlobal('fetch', vi.fn(async () => res({}, false, 403)))
    expect(await getCalendlyUser('bad')).toEqual({ ok: false, reason: 'invalid' })
  })
  it('a 5xx / network error → unknown (do NOT treat as a rejection)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res({}, false, 503)))
    expect(await getCalendlyUser('pat')).toEqual({ ok: false, reason: 'unknown' })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
    expect(await getCalendlyUser('pat')).toEqual({ ok: false, reason: 'unknown' })
  })
})

describe('fetchCalendlyBusy', () => {
  it('maps busy_times to BusyPeriod[] and bounds the window to Calendly\'s 7 days', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(String(url))
      if (String(url).includes('/users/me')) return res({ resource: { uri: 'u1' } })
      return res({ collection: [
        { type: 'calendly', start_time: '2026-07-08T14:00:00Z', end_time: '2026-07-08T15:00:00Z' },
        { type: 'external', start_time: '', end_time: '2026-07-09T10:00:00Z' }, // dropped (no start)
      ] })
    }))
    const busy = await fetchCalendlyBusy('pat', { days: 30, now }) // asks 30 → clamped to 7
    expect(busy).toEqual([{ start: '2026-07-08T14:00:00Z', end: '2026-07-08T15:00:00Z' }])
    const busyCall = calls.find((c) => c.includes('/user_busy_times'))!
    const end = new Date(new URL(busyCall).searchParams.get('end_time')!)
    expect(Math.round((end.getTime() - now.getTime()) / 86_400_000)).toBe(7) // clamped
  })
  it('null when the token is invalid (no availability write)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res({}, false, 401)))
    expect(await fetchCalendlyBusy('bad', { now })).toBeNull()
  })
  it('null when the busy-times call fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      String(url).includes('/users/me') ? res({ resource: { uri: 'u1' } }) : res({}, false, 500)))
    expect(await fetchCalendlyBusy('pat', { now })).toBeNull()
  })
})

describe('cancelCalendlyEvent + calendlyEventUuid', () => {
  it('POSTs the cancellation and returns ok', async () => {
    const seen: any[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      seen.push({ url: String(url), init })
      return res({}, true, 201)
    }))
    expect(await cancelCalendlyEvent('pat', 'EV123', 'refunded')).toBe(true)
    expect(seen[0].url).toContain('/scheduled_events/EV123/cancellation')
    expect(JSON.parse(seen[0].init.body)).toEqual({ reason: 'refunded' })
  })
  it('false on empty uuid / failure', async () => {
    expect(await cancelCalendlyEvent('pat', '')).toBe(false)
    vi.stubGlobal('fetch', vi.fn(async () => res({}, false, 404)))
    expect(await cancelCalendlyEvent('pat', 'EV')).toBe(false)
  })
  it('extracts the event uuid from a Calendly event URI (alphanumeric, not hex)', () => {
    expect(calendlyEventUuid('https://api.calendly.com/scheduled_events/GBGGGGGGGGGGGGGG')).toBe('GBGGGGGGGGGGGGGG')
    expect(calendlyEventUuid('https://api.calendly.com/scheduled_events/AbC123dEf456GhI7/invitees')).toBe('AbC123dEf456GhI7')
    expect(calendlyEventUuid('https://calendly.com/acme/intro')).toBeNull()
    expect(calendlyEventUuid(null)).toBeNull()
  })
})

describe('createCalendlySchedulingLink', () => {
  const EVENT_TYPE = 'https://api.calendly.com/event_types/GBGGGGGG'
  it('POSTs a single-use link (max_event_count 1) and returns booking_url', async () => {
    const seen: any[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      seen.push({ url: String(url), body: JSON.parse(init.body) })
      return res({ resource: { booking_url: 'https://calendly.com/acme/intro/one-time-abc' } }, true, 201)
    }))
    const link = await createCalendlySchedulingLink('pat', EVENT_TYPE)
    expect(link).toBe('https://calendly.com/acme/intro/one-time-abc')
    expect(seen[0].url).toBe('https://api.calendly.com/scheduling_links')
    expect(seen[0].body).toEqual({ max_event_count: 1, owner: EVENT_TYPE, owner_type: 'EventType' })
  })
  it('rejects a non-Calendly / malformed event-type URI without calling the API (SSRF/tamper guard)', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await createCalendlySchedulingLink('pat', 'https://evil.example/event_types/x')).toBeNull()
    expect(await createCalendlySchedulingLink('pat', 'https://api.calendly.com/scheduled_events/EV1')).toBeNull()
    expect(await createCalendlySchedulingLink('pat', '')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
  it('null on Calendly failure or a missing booking_url (caller keeps the reusable link)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res({}, false, 403)))
    expect(await createCalendlySchedulingLink('pat', EVENT_TYPE)).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => res({ resource: {} }, true, 201)))
    expect(await createCalendlySchedulingLink('pat', EVENT_TYPE)).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
    expect(await createCalendlySchedulingLink('pat', EVENT_TYPE)).toBeNull()
  })
})
