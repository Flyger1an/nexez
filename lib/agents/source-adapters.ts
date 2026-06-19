import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AgentPage, PUBLIC_PAGE_SELECT } from '../agent-page'
import { searchAgentPages, type AgentSearchResult } from '../agent-search'
import { publicLaunchVisiblePages } from '../public-page-visibility'
import { mergeRankedResults, semanticSearch } from './semantic-search'

// Source adapters are the multi-platform seam: each is a place Nexxi can shop. v1 ships
// only the `nexez` adapter; v2 adds others (recommendations, other marketplaces) by
// registering them here — the agent loop never changes, it just calls searchAllSources().

export type SourceAdapterContext = { db: SupabaseClient; baseUrl: string }

export type SourceAdapter = {
  /** Stable id, e.g. 'nexez'. */
  id: string
  /** Human label for attribution/UX. */
  label: string
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

const registry = new Map<string, SourceAdapter>([[nexezAdapter.id, nexezAdapter]])

/** Register (or replace, by id) a source adapter. Idempotent; never touches the agent loop. */
export function registerSourceAdapter(adapter: SourceAdapter): void {
  registry.set(adapter.id, adapter)
}

export function getSourceAdapters(): SourceAdapter[] {
  return [...registry.values()]
}

/**
 * Fan out the query across every registered source, merge, rank by score, cap to `limit`.
 * A single failing source is isolated (best-effort) so it can't take down the others — but
 * if EVERY source fails, the error is surfaced so the caller's deterministic-fallback path
 * still kicks in (matching the pre-adapter behavior when nexez was the only source).
 */
export async function searchAllSources(
  query: string,
  limit: number,
  ctx: SourceAdapterContext,
  adapters: SourceAdapter[] = getSourceAdapters(),
): Promise<AgentSearchResult[]> {
  const settled = await Promise.allSettled(adapters.map((a) => a.search(query, limit, ctx)))
  const fulfilled = settled.filter(
    (s): s is PromiseFulfilledResult<AgentSearchResult[]> => s.status === 'fulfilled',
  )
  const rejected = settled.filter((s): s is PromiseRejectedResult => s.status === 'rejected')

  if (fulfilled.length === 0 && rejected.length > 0) throw rejected[0].reason

  return fulfilled
    .flatMap((s) => s.value)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
