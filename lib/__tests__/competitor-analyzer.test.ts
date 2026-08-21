import { describe, expect, it, vi } from 'vitest'

vi.mock('../importer', () => ({
  isPathAllowed: vi.fn(async () => true),
  fetchHtmlSafe: vi.fn(async (url: string) => url.endsWith('/llms.txt') || url.endsWith('/agent.json')
    ? null
    : '<html><h1>Strategy services</h1><h2>Pricing</h2><p>Book a consultation for $250. Contact hello@example.test.</p></html>'),
}))
vi.mock('../llm', () => ({
  isLlmConfigured: vi.fn(() => false),
  llmComplete: vi.fn(async () => null),
}))

import { analyzeCompetitorSite } from '../competitor-analyzer'

describe('competitor analysis provenance', () => {
  it('labels fresh and process-cache results without leaking owner comparisons', async () => {
    const url = 'https://cache-isolation.example.test'
    const first = await analyzeCompetitorSite(url, {
      userNexezPage: { slug: 'owner-page', readiness: 90, trust: 80, offerCount: 2 },
    })
    const second = await analyzeCompetitorSite(url)

    expect(first.provenance).toMatchObject({
      analysis: 'deterministic',
      cache: { hit: false, scope: 'process', ttlHours: 48 },
    })
    expect(first.userComparison?.slug).toBe('owner-page')
    expect(second.provenance.cache.hit).toBe(true)
    expect(second.userComparison).toBeUndefined()
  })
})
