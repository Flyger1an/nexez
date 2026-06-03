import { describe, expect, it } from 'vitest'
import { getTopQueries, getTopReferrers } from '../demand-insights'

describe('getTopQueries', () => {
  it('counts, dedupes (case/space-insensitive), sorts by frequency', () => {
    const events = [{ query: 'Plumber near me' }, { query: 'plumber  near me' }, { query: 'emergency repair' }]
    const visits = [{ query: 'PLUMBER NEAR ME' }, { query: null }, { query: ' ' }]
    const out = getTopQueries(events, visits)
    expect(out[0]).toEqual({ query: 'plumber near me', count: 3 })
    expect(out.find((q) => q.query === 'emergency repair')?.count).toBe(1)
  })
  it('ignores too-short/empty and respects limit', () => {
    const events = Array.from({ length: 30 }, (_, i) => ({ query: `q${i}` }))
    expect(getTopQueries(events, [], 5)).toHaveLength(5)
    expect(getTopQueries([{ query: 'a' }, { query: '' }], [])).toEqual([])
  })
})

describe('getTopReferrers', () => {
  it('extracts hosts (strips www) and counts', () => {
    const visits = [
      { referrer: 'https://www.chatgpt.com/x' },
      { referrer: 'https://chatgpt.com/y' },
      { referrer: 'https://perplexity.ai/z' },
      { referrer: null },
    ]
    const out = getTopReferrers(visits)
    expect(out[0]).toEqual({ query: 'chatgpt.com', count: 2 })
    expect(out.find((r) => r.query === 'perplexity.ai')?.count).toBe(1)
  })
})
