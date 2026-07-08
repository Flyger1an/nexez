import { describe, expect, it } from 'vitest'
import { daysSince, freshnessLabel, isStale, priceValidUntil, staleNudgeDue } from '../freshness'

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

describe('priceValidUntil', () => {
  it('rolls a fresh window forward from the last update', () => {
    // updated 10 days ago + 90-day window = 80 days ahead of `now`
    expect(priceValidUntil({ updated_at: daysAgo(10) }, 90, now)).toBe('2026-08-22')
  })
  it('never emits a past date for a stale page (reports through today)', () => {
    expect(priceValidUntil({ updated_at: daysAgo(120) }, 90, now)).toBe('2026-06-03')
  })
  it('falls back to created_at, returns null when absent or invalid', () => {
    expect(priceValidUntil({ created_at: daysAgo(0) }, 90, now)).toBe('2026-09-01')
    expect(priceValidUntil({}, 90, now)).toBeNull()
    expect(priceValidUntil({ updated_at: 'not-a-date' }, 90, now)).toBeNull()
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

describe('staleNudgeDue', () => {
  it('is due when never nudged before', () => {
    expect(staleNudgeDue(null, now)).toBe(true)
    expect(staleNudgeDue(undefined, now)).toBe(true)
  })
  it('is NOT due inside the cooldown window', () => {
    expect(staleNudgeDue(daysAgo(10), now, 30)).toBe(false)
    expect(staleNudgeDue(daysAgo(29), now, 30)).toBe(false)
  })
  it('is due once the cooldown has elapsed', () => {
    expect(staleNudgeDue(daysAgo(30), now, 30)).toBe(true)
    expect(staleNudgeDue(daysAgo(45), now, 30)).toBe(true)
  })
  it('treats an unparseable timestamp as due (never permanently suppress)', () => {
    expect(staleNudgeDue('not-a-date', now)).toBe(true)
  })
})
