// Content-freshness monitor: flag pages whose agent data may have drifted from
// the source business. Pure + tested.

export const DEFAULT_STALE_DAYS = 90

export function daysSince(dateStr: string | null | undefined, now: Date = new Date()): number | null {
  if (!dateStr) return null
  const t = new Date(dateStr).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((now.getTime() - t) / (1000 * 60 * 60 * 24))
}

/** A published page with a source website that hasn't been updated in a while is "stale". */
export function isStale(
  page: { is_published?: boolean; website_url?: string | null; updated_at?: string | null; created_at?: string | null },
  thresholdDays: number = DEFAULT_STALE_DAYS,
  now: Date = new Date(),
): boolean {
  if (!page.is_published) return false
  const days = daysSince(page.updated_at || page.created_at, now)
  return days != null && days >= thresholdDays
}

/**
 * schema.org `Offer.priceValidUntil` - the date a listed price should no longer be
 * assumed current. Tied to the same freshness contract as {@link isStale}: a price is
 * good for `thresholdDays` past the page's last update and rolls forward whenever the
 * owner edits. Always emits a date (so agents never treat the price as permanent) and
 * never a past one - a page already beyond its window reports "valid through today"
 * (re-verify) rather than an expired date that agents/crawlers would treat as a
 * withdrawn offer. Returns a `YYYY-MM-DD` string, or null when the page has no timestamp.
 */
export function priceValidUntil(
  page: { updated_at?: string | null; created_at?: string | null },
  thresholdDays: number = DEFAULT_STALE_DAYS,
  now: Date = new Date(),
): string | null {
  const base = page.updated_at || page.created_at
  if (!base) return null
  const t = new Date(base).getTime()
  if (Number.isNaN(t)) return null
  const untilMs = Math.max(t + thresholdDays * 86400000, now.getTime())
  return new Date(untilMs).toISOString().slice(0, 10)
}

export function freshnessLabel(
  page: { updated_at?: string | null; created_at?: string | null },
  now: Date = new Date(),
): string {
  const days = daysSince(page.updated_at || page.created_at, now)
  if (days == null) return 'Unknown'
  if (days <= 0) return 'Updated today'
  if (days === 1) return 'Updated yesterday'
  if (days < 30) return `Updated ${days} days ago`
  if (days < 60) return 'Updated last month'
  return `Updated ${Math.floor(days / 30)} months ago`
}

/** Days a stale-listing re-interview nudge waits before it may fire again for the
 *  same page - so the daily freshness cron nudges each page at most once per window. */
export const STALE_NUDGE_COOLDOWN_DAYS = 30

/**
 * True when a stale page is due for a re-interview nudge: never nudged before, or
 * the last nudge is older than the cooldown. Unparseable timestamps → due (a
 * missing/garbled ledger row must not permanently suppress the nudge).
 */
export function staleNudgeDue(
  lastNudgedAt: string | null | undefined,
  now: Date = new Date(),
  cooldownDays: number = STALE_NUDGE_COOLDOWN_DAYS,
): boolean {
  if (!lastNudgedAt) return true
  const t = new Date(lastNudgedAt).getTime()
  if (Number.isNaN(t)) return true
  return now.getTime() - t >= cooldownDays * 86400000
}
