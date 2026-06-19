import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { embedText, isEmbeddingsConfigured, mergeRankedResults } from './semantic-search'
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
})
