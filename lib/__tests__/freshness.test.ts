import { describe, expect, it } from 'vitest'
import { daysSince, freshnessLabel, isStale } from '../freshness'

const now = new Date('2026-06-03T00:00:00Z')
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString()

describe('daysSince', () => {
  it('computes whole days, null for invalid', () => {
    expect(daysSince(daysAgo(5), now)).toBe(5)
    expect(daysSince(null, now)).toBeNull()
    expect(daysSince('not-a-date', now)).toBeNull()
  })
})

describe('isStale', () => {
  it('stale only for published pages past threshold', () => {
    expect(isStale({ is_published: true, website_url: 'x', updated_at: daysAgo(120) }, 90, now)).toBe(true)
    expect(isStale({ is_published: true, website_url: 'x', updated_at: daysAgo(10) }, 90, now)).toBe(false)
    expect(isStale({ is_published: false, website_url: 'x', updated_at: daysAgo(400) }, 90, now)).toBe(false)
  })
  it('falls back to created_at', () => {
    expect(isStale({ is_published: true, created_at: daysAgo(200) }, 90, now)).toBe(true)
  })
})

describe('freshnessLabel', () => {
  it('reads naturally', () => {
    expect(freshnessLabel({ updated_at: daysAgo(0) }, now)).toBe('Updated today')
    expect(freshnessLabel({ updated_at: daysAgo(1) }, now)).toBe('Updated yesterday')
    expect(freshnessLabel({ updated_at: daysAgo(10) }, now)).toBe('Updated 10 days ago')
    expect(freshnessLabel({ updated_at: daysAgo(120) }, now)).toContain('months ago')
  })
})
