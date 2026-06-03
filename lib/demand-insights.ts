// "What agents asked" — aggregate the query/intent signals we already collect
// on checkout_events + agent_visits into demand insights. Pure + tested.

export type QueryStat = { query: string; count: number }

/**
 * Queries agents searched for that this business doesn't appear to serve —
 * no meaningful word overlap with any offer name/description. Product gold:
 * "agents searched for X you don't offer."
 */
export function getUnservedQueries(queries: QueryStat[], offerTexts: string[]): QueryStat[] {
  const haystack = offerTexts.join(' ').toLowerCase()
  if (!haystack.trim()) return [] // no offers to compare against → don't guess
  return queries.filter((q) => {
    const words = q.query.split(/\s+/).filter((w) => w.length >= 4)
    if (words.length === 0) return !haystack.includes(q.query)
    return !words.some((w) => haystack.includes(w))
  })
}

function normalizeQuery(q: string | null | undefined): string {
  return (q || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Top distinct agent queries across events + visits (most frequent first). */
export function getTopQueries(
  events: { query?: string | null }[],
  visits: { query?: string | null }[],
  limit = 15,
): QueryStat[] {
  const counts = new Map<string, number>()
  const add = (q: string | null | undefined) => {
    const norm = normalizeQuery(q)
    if (norm.length < 2) return
    counts.set(norm, (counts.get(norm) ?? 0) + 1)
  }
  for (const e of events) add(e.query)
  for (const v of visits) add(v.query)

  return [...counts.entries()]
    .map(([query, count]) => ({ query, count }))
    .sort((a, b) => b.count - a.count || a.query.localeCompare(b.query))
    .slice(0, limit)
}

/** Top referrer hosts (where agents/visitors came from). */
export function getTopReferrers(
  visits: { referrer?: string | null }[],
  limit = 8,
): QueryStat[] {
  const counts = new Map<string, number>()
  for (const v of visits) {
    const raw = (v.referrer || '').trim()
    if (!raw) continue
    let host = raw
    try {
      host = new URL(raw).hostname.replace(/^www\./, '')
    } catch {
      host = raw.replace(/^https?:\/\//, '').split('/')[0] ?? raw
    }
    if (!host) continue
    counts.set(host, (counts.get(host) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([query, count]) => ({ query, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}
