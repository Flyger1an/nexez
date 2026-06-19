import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AgentPage, PUBLIC_PAGE_SELECT, getCheckoutOffers } from '../agent-page'
import { buildResult, type AgentSearchResult } from '../agent-search'
import { publicLaunchVisiblePages } from '../public-page-visibility'

// pgvector semantic retrieval for the Nexxi agent. Env-gated: with no embeddings key this
// is a no-op and the caller falls back to lexical search, so prod is unaffected until the
// key + backfill land. Provider is OpenAI-compatible (text-embedding-3-small by default).

const EMBEDDING_DIMS = 1536

function embeddingsKey(): string {
  return process.env.EMBEDDINGS_API_KEY || process.env.OPENAI_API_KEY || ''
}
function embeddingsModel(): string {
  return process.env.EMBEDDINGS_MODEL || 'text-embedding-3-small'
}
function embeddingsBase(): string {
  return (process.env.EMBEDDINGS_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
}

export function isEmbeddingsConfigured(): boolean {
  return Boolean(embeddingsKey())
}

/** Embed a single string. Returns null when unconfigured or on any failure (→ lexical fallback). */
export async function embedText(text: string): Promise<number[] | null> {
  const key = embeddingsKey()
  const input = (text || '').trim()
  if (!key || !input) return null
  try {
    const res = await fetch(`${embeddingsBase()}/embeddings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: embeddingsModel(), input: input.slice(0, 8000) }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const json = await res.json()
    const vec = json?.data?.[0]?.embedding
    return Array.isArray(vec) && vec.length === EMBEDDING_DIMS ? (vec as number[]) : null
  } catch {
    return null
  }
}

/** The text we embed for a page (used by the backfill). Compact + signal-rich. */
export function pageEmbeddingText(page: AgentPage): string {
  const offers = getCheckoutOffers(page).map((o) => o.name).filter(Boolean).slice(0, 12)
  return [
    page.name,
    page.industry || '',
    page.location || '',
    page.audience || '',
    page.description || '',
    offers.length ? `Offers: ${offers.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('. ')
    .slice(0, 8000)
}

/**
 * Vector retrieval: embed the query, get vector-ranked published slugs via the RPC, fetch
 * their public projection, apply launch-visibility, and build one result per page scored by
 * similarity (so semantic-only matches — zero lexical overlap — still surface). Returns []
 * when unconfigured / no embeddings populated / any failure (caller falls back to lexical).
 */
export async function semanticSearch(
  db: SupabaseClient,
  query: string,
  limit: number,
  baseUrl: string,
): Promise<AgentSearchResult[]> {
  if (!isEmbeddingsConfigured()) return []
  const queryEmbedding = await embedText(query)
  if (!queryEmbedding) return []

  try {
    const { data: matches, error } = await db.rpc('match_nexie_pages', {
      query_embedding: queryEmbedding,
      match_count: Math.max(limit * 4, 20),
    })
    if (error || !Array.isArray(matches) || !matches.length) return []

    const similarityBySlug = new Map<string, number>()
    for (const m of matches as { slug: string; similarity: number }[]) {
      if (m?.slug) similarityBySlug.set(m.slug, typeof m.similarity === 'number' ? m.similarity : 0)
    }

    const { data: pages } = await db
      .from('pages_public')
      .select(PUBLIC_PAGE_SELECT)
      .in('slug', [...similarityBySlug.keys()])
      .eq('is_published', true)
      .returns<AgentPage[]>()

    const results: AgentSearchResult[] = publicLaunchVisiblePages(pages ?? []).map((page) => {
      const sim = similarityBySlug.get(page.slug) ?? 0
      // Scale cosine similarity (0..1) into a score comparable to lexical token scores so the
      // two lists merge sensibly; floor at 0.1 so a real semantic hit never rounds to nothing.
      const score = Math.max(0.1, Math.round(sim * 100) / 10)
      return buildResult(page, getCheckoutOffers(page)[0] ?? null, score, baseUrl)
    })

    return results.sort((a, b) => (similarityBySlug.get(b.page.slug) ?? 0) - (similarityBySlug.get(a.page.slug) ?? 0)).slice(0, limit)
  } catch {
    return []
  }
}

/** Merge semantic + lexical results: dedupe by slug+offer, keep the higher score, rank, cap. */
export function mergeRankedResults(primary: AgentSearchResult[], secondary: AgentSearchResult[], limit: number): AgentSearchResult[] {
  const byKey = new Map<string, AgentSearchResult>()
  const keyOf = (r: AgentSearchResult) => `${r.page.slug}:${r.offer?.key ?? 'page'}`
  for (const r of [...primary, ...secondary]) {
    const k = keyOf(r)
    const existing = byKey.get(k)
    if (!existing || r.score > existing.score) byKey.set(k, r)
  }
  return [...byKey.values()].sort((a, b) => b.score - a.score).slice(0, Math.max(1, limit))
}
