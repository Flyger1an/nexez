// Real integration mappers (Phase 3 "Set once, forget").
// Pure, testable functions that turn live vendor API payloads into our OfferItem
// shape / availability windows. The route handlers do the authenticated fetch
// and fall back to sample data when no credentials are supplied.

import type { OfferItem, PricingTier } from './agent-page'

const asCents = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) ? n : null)
const usd = (c: number): string => `$${Math.round(c / 100).toLocaleString()}`
const stripHtml = (s: string): string =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim()

// ---------------------------------------------------------------------------
// Square - Catalog API (GET /v2/catalog/list?types=ITEM)
// ---------------------------------------------------------------------------
export function mapSquareCatalogToOffers(objects: unknown[]): OfferItem[] {
  const offers: OfferItem[] = []
  for (const raw of objects ?? []) {
    const obj = raw as Record<string, any>
    if (obj?.type !== 'ITEM' || !obj.item_data) continue
    const item = obj.item_data
    const variations: any[] = Array.isArray(item.variations) ? item.variations : []
    const priced = variations
      .map((v) => ({
        name: v?.item_variation_data?.name as string | undefined,
        amount: asCents(v?.item_variation_data?.price_money?.amount),
      }))
      .filter((v) => v.amount != null) as Array<{ name: string | undefined; amount: number }>
    const name = String(item.name ?? '').trim().slice(0, 120)
    if (!name) continue
    const min = priced.length ? Math.min(...priced.map((p) => p.amount)) : null
    const tiers: PricingTier[] | undefined =
      priced.length > 1 ? priced.slice(0, 6).map((p) => ({ name: p.name || 'Option', price: usd(p.amount) })) : undefined
    offers.push({
      name,
      description: stripHtml(String(item.description ?? item.description_plaintext ?? '')).slice(0, 300),
      price: min != null ? (priced.length > 1 ? `From ${usd(min)}` : usd(min)) : 'See options',
      url: '',
      source: 'square',
      confidence: 0.95,
      ...(tiers ? { tiers } : {}),
      metadata: { square_item_id: obj.id, imported_at: new Date().toISOString() },
    })
  }
  return offers
}

// ---------------------------------------------------------------------------
// Acuity - Appointment Types API (GET /api/v1/appointment-types)
// ---------------------------------------------------------------------------
export function mapAcuityTypesToOffers(types: unknown[]): OfferItem[] {
  const offers: OfferItem[] = []
  for (const raw of types ?? []) {
    const t = raw as Record<string, any>
    const name = String(t?.name ?? '').trim().slice(0, 120)
    if (!name) continue
    const priceNum = Number(t?.price)
    const price = Number.isFinite(priceNum) ? (priceNum > 0 ? `$${Math.round(priceNum)}` : '$0') : 'Custom'
    const dur = Number(t?.duration)
    offers.push({
      name,
      description: stripHtml(String(t?.description ?? '')).slice(0, 300),
      price,
      url: typeof t?.schedulingUrl === 'string' ? t.schedulingUrl : '',
      duration: Number.isFinite(dur) && dur > 0 ? `${dur} min` : undefined,
      source: 'acuity',
      confidence: 0.95,
      metadata: { acuity_appointment_type_id: t?.id, imported_at: new Date().toISOString() },
    })
  }
  return offers
}

// ---------------------------------------------------------------------------
// Google Calendar - derive open windows by subtracting busy periods
// (from the freeBusy API) from business hours. Best-effort, server-local time.
// ---------------------------------------------------------------------------
export type BusyPeriod = { start: string; end: string }
export type DerivedWindow = { date: string; start: string; end: string; label: string; time_zone?: string }

const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
function clockLabel(d: Date): string {
  let h = d.getHours()
  const m = d.getMinutes()
  const ap = h >= 12 ? 'pm' : 'am'
  h = h % 12 || 12
  return m ? `${h}:${pad(m)}${ap}` : `${h}:00${ap}`
}

export function deriveAvailabilityWindows(
  busy: BusyPeriod[],
  opts: { days?: number; dayStart?: number; dayEnd?: number; now?: Date; max?: number } = {},
): DerivedWindow[] {
  const days = opts.days ?? 14
  const dayStart = opts.dayStart ?? 9
  const dayEnd = opts.dayEnd ?? 17
  const max = opts.max ?? 6
  const now = opts.now ?? new Date()
  const busyRanges = (busy ?? [])
    .map((b) => ({ s: new Date(b.start).getTime(), e: new Date(b.end).getTime() }))
    .filter((b) => Number.isFinite(b.s) && Number.isFinite(b.e) && b.e > b.s)

  const windows: DerivedWindow[] = []
  for (let d = 0; d < days && windows.length < max; d++) {
    const day = new Date(now.getTime() + d * 86400000)
    const dow = day.getDay()
    if (dow === 0 || dow === 6) continue // weekdays only
    const startDt = new Date(day)
    startDt.setHours(dayStart, 0, 0, 0)
    const endDt = new Date(day)
    endDt.setHours(dayEnd, 0, 0, 0)
    const start = Math.max(startDt.getTime(), now.getTime())
    const end = endDt.getTime()
    if (start >= end) continue

    const dayBusy = busyRanges
      .filter((b) => b.e > start && b.s < end)
      .map((b) => ({ s: Math.max(b.s, start), e: Math.min(b.e, end) }))
      .sort((a, b) => a.s - b.s)

    let cursor = start
    const free: { s: number; e: number }[] = []
    for (const b of dayBusy) {
      if (b.s > cursor) free.push({ s: cursor, e: b.s })
      cursor = Math.max(cursor, b.e)
    }
    if (cursor < end) free.push({ s: cursor, e: end })

    for (const f of free) {
      if (f.e - f.s < 30 * 60000) continue // ignore <30 min gaps
      if (windows.length >= max) break
      const fs = new Date(f.s)
      const fe = new Date(f.e)
      windows.push({
        date: fs.toISOString().slice(0, 10),
        start: hhmm(fs),
        end: hhmm(fe),
        label: `${fs.toLocaleDateString('en-US', { weekday: 'short' })} ${clockLabel(fs)}–${clockLabel(fe)}`,
      })
    }
  }
  return windows
}
