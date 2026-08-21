import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
const h = vi.hoisted(() => ({
  adminRpc: vi.fn(),
}))

vi.mock('../../utils/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: h.adminRpc }),
}))

import { embedText, isEmbeddingsConfigured, mergeRankedResults, semanticSearch } from './semantic-search'
import type { AgentSearchResult } from '../agent-search'

function r(slug: string, score: number, offerKey?: string): AgentSearchResult {
  return {
    score,
    page: { name: slug, slug, url: '', agent_json_url: '', description: null, audience: null, location: null, contact_email: null },
    offer: offerKey ? { key: offerKey } : null,
  } as unknown as AgentSearchResult
}

describe('embeddings gating (no key → lexical fallback)', () => {
  beforeEach(() => {
    h.adminRpc.mockReset()
    delete process.env.EMBEDDINGS_API_KEY
    delete process.env.OPENAI_API_KEY
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.EMBEDDINGS_API_KEY
    delete process.env.OPENAI_API_KEY
  })

  it('is unconfigured without a key and embedText returns null', async () => {
    expect(isEmbeddingsConfigured()).toBe(false)
    expect(await embedText('hello')).toBeNull()
  })

  it('is configured when a key is present', () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    expect(isEmbeddingsConfigured()).toBe(true)
  })

  it('embedText returns null on a non-200 (falls back, never throws)', async () => {
    process.env.EMBEDDINGS_API_KEY = 'sk-test'
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })))
    expect(await embedText('hello')).toBeNull()
  })

  it('calls the privileged vector matcher through the server admin client', async () => {
    process.env.EMBEDDINGS_API_KEY = 'sk-test'
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [{ embedding: Array(1536).fill(0.1) }] })))
    h.adminRpc.mockResolvedValue({ data: [], error: null })
    const userRpc = vi.fn()

    await expect(semanticSearch({ rpc: userRpc } as never, 'strategy help', 5, 'https://nexez.app')).resolves.toEqual([])

    expect(h.adminRpc).toHaveBeenCalledWith('match_nexie_pages', {
      query_embedding: Array(1536).fill(0.1),
      match_count: 20,
    })
    expect(userRpc).not.toHaveBeenCalled()
  })
})

describe('mergeRankedResults', () => {
  it('dedupes by slug+offer keeping the higher score, sorts desc, and caps', () => {
    const semantic = [r('a', 8, 'services-0'), r('b', 6)]
    const lexical = [r('a', 3, 'services-0'), r('c', 9)]
    const out = mergeRankedResults(semantic, lexical, 2)
    expect(out.map((x) => x.page.slug)).toEqual(['c', 'a']) // 9, 8; b(6) past the cap
    expect(out.find((x) => x.page.slug === 'a')!.score).toBe(8) // kept the higher of the dup
  })

  it('treats different offers on the same page as distinct results', () => {
    const out = mergeRankedResults([r('a', 5, 'services-0')], [r('a', 4, 'products-1')], 10)
    expect(out).toHaveLength(2)
  })

  it('uses the shared evidence comparator when semantic relevance ties lexical relevance', () => {
    const available = ranked('available', 5, 'available')
    const unspecified = ranked('unspecified', 5, 'unspecified')

    const out = mergeRankedResults([unspecified], [available], 10)
    expect(out.map((result) => result.page.slug)).toEqual(['available', 'unspecified'])
  })
})

function ranked(
  slug: string,
  score: number,
  availability: 'available' | 'unspecified',
): AgentSearchResult {
  return {
    ...r(slug, score),
    ranking: {
      policy_version: 'nexez.discovery-ranking.v1',
      relevance: score,
      location: 'not-requested',
      availability,
      actionability: 'transaction-ready',
      seller_verified: false,
      agent_ready_certified: false,
      verified_purchase_reviews: 0,
      reputation: null,
      review_evidence: 'cold-start',
      readiness: 50,
      freshness: 'unknown',
    },
  }
}
