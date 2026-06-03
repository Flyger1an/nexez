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

import { getUnservedQueries } from '../demand-insights'
describe('getUnservedQueries', () => {
  const q = (query: string, count = 1) => ({ query, count })
  it('flags queries with no word overlap with offers', () => {
    const offers = ['Emergency plumbing repair', 'Drain cleaning service']
    const unserved = getUnservedQueries([q('plumbing'), q('electrician rewiring'), q('boiler install')], offers)
    expect(unserved.map((u) => u.query)).toContain('electrician rewiring')
    expect(unserved.map((u) => u.query)).toContain('boiler install')
    expect(unserved.map((u) => u.query)).not.toContain('plumbing')
  })
  it('returns nothing when there are no offers to compare', () => {
    expect(getUnservedQueries([q('anything')], [])).toEqual([])
  })
})
