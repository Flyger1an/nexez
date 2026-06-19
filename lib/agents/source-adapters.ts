import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AgentPage, PUBLIC_PAGE_SELECT } from '../agent-page'
import { searchAgentPages, type AgentSearchResult } from '../agent-search'
import { publicLaunchVisiblePages } from '../public-page-visibility'
import { mergeRankedResults, semanticSearch } from './semantic-search'
import { googlePlacesAdapter, yelpAdapter } from './external-sources'

// Source adapters are the multi-platform seam: each is a place Nexxi can shop. v1 ships
// only the `nexez` adapter; v2 adds others (recommendations, other marketplaces) by
// registering them here — the agent loop never changes, it just calls searchAllSources().

export type SourceAdapterContext = {
  db: SupabaseClient
  baseUrl: string
  /** Buyer location (from preferences) — some sources (e.g. Yelp) require it to search. */
  location?: string | null
}

export type SourceAdapter = {
  /** Stable id, e.g. 'nexez'. */
  id: string
  /** Human label for attribution/UX. */
  label: string
  /**
   * Whether this source can be used right now (e.g. its API key is configured). Default true.
   * The user-facing source picker only offers adapters that report available().
   */
  available?: () => boolean
  /** Return ranked results (each carries a `score`) for the query. */
  search(query: string, limit: number, ctx: SourceAdapterContext): Promise<AgentSearchResult[]>
}

/** The first-party adapter: the Nexez marketplace (published, launch-visible pages). */
export const nexezAdapter: SourceAdapter = {
  id: 'nexez',
  label: 'Nexez',
  async search(query, limit, ctx) {
    const { data, error } = await ctx.db
      .from('pages_public')
      .select(PUBLIC_PAGE_SELECT)
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(150)
      .returns<AgentPage[]>()
    if (error) throw new Error(`Nexez search is temporarily unavailable: ${error.message}`)
    const lexical = searchAgentPages(publicLaunchVisiblePages(data), query, limit, ctx.baseUrl)
    // Semantic retrieval widens recall to lexically-different-but-similar pages. It's a no-op
    // (→ lexical only) until the embeddings key + page backfill are in place, so prod search is
    // unaffected today; best-effort, never breaks the lexical floor.
    const semantic = await semanticSearch(ctx.db, query, limit, ctx.baseUrl).catch(() => [])
    return semantic.length ? mergeRankedResults(semantic, lexical, limit) : lexical
  },
}

const registry = new Map<string, SourceAdapter>([
  [nexezAdapter.id, nexezAdapter],
  [yelpAdapter.id, yelpAdapter],
  [googlePlacesAdapter.id, googlePlacesAdapter],
])

/** Register (or replace, by id) a source adapter. Idempotent; never touches the agent loop. */
export function registerSourceAdapter(adapter: SourceAdapter): void {
  registry.set(adapter.id, adapter)
}

export function getSourceAdapters(): SourceAdapter[] {
  return [...registry.values()]
}

/** The Nexez marketplace is the core transactable source — always searched, never opt-out. */
export const CORE_SOURCE_ID = 'nexez'

/**
 * Sources usable right now (key configured) for the user-facing picker. Nexez is always first.
 */
export function getAvailableSources(): { id: string; label: string; core: boolean }[] {
  return getSourceAdapters()
    .filter((a) => !a.available || a.available())
    .map((a) => ({ id: a.id, label: a.label, core: a.id === CORE_SOURCE_ID }))
}

/**
 * Fan out the query across the selected, available sources, stamp each result with its source,
 * merge, rank by score, cap to `limit`. A single failing source is isolated (best-effort) so it
 * can't take down the others — but if EVERY active source fails, the error is surfaced so the
 * caller's deterministic-fallback path still kicks in (matching the original nexez-only behavior).
 *
 * `enabledIds` is the buyer's source selection: the core Nexez source is always included; any
 * other source must be both available (configured) and present in `enabledIds`. When `enabledIds`
 * is omitted, every available source is searched.
 */
export async function searchAllSources(
  query: string,
  limit: number,
  ctx: SourceAdapterContext,
  options: { enabledIds?: string[] } = {},
  adapters: SourceAdapter[] = getSourceAdapters(),
): Promise<AgentSearchResult[]> {
  const active = adapters.filter((a) => {
    if (a.available && !a.available()) return false
    if (a.id === CORE_SOURCE_ID) return true
    return options.enabledIds ? options.enabledIds.includes(a.id) : true
  })

  const settled = await Promise.allSettled(active.map((a) => a.search(query, limit, ctx)))
  const fulfilledCount = settled.filter((s) => s.status === 'fulfilled').length
  const rejected = settled.filter((s): s is PromiseRejectedResult => s.status === 'rejected')

  if (fulfilledCount === 0 && rejected.length > 0) throw rejected[0].reason

  const results = settled.flatMap((s, i) =>
    s.status === 'fulfilled'
      ? s.value.map((r) => ({ ...r, source: r.source ?? { id: active[i].id, label: active[i].label } }))
      : [],
  )
  return results.sort((a, b) => b.score - a.score).slice(0, limit)
}
