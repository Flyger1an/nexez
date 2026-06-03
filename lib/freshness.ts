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
