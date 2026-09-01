import { describe, it, expect } from 'vitest'
import { DEFAULT_PREFERENCES, normalizePreferences, preferencesPromptBlock } from './nexxi-preferences'

describe('normalizePreferences', () => {
  it('returns full defaults for empty / garbage input', () => {
    expect(normalizePreferences(undefined)).toEqual(DEFAULT_PREFERENCES)
    expect(normalizePreferences(null)).toEqual(DEFAULT_PREFERENCES)
    expect(normalizePreferences('nope')).toEqual(DEFAULT_PREFERENCES)
    expect(normalizePreferences(42)).toEqual(DEFAULT_PREFERENCES)
  })

  it('keeps a positive budget (rounded) and clamps the ceiling; rejects non-positive / NaN', () => {
    expect(normalizePreferences({ budgetMax: 499.6 }).budgetMax).toBe(500)
    expect(normalizePreferences({ budgetMax: 0 }).budgetMax).toBeNull()
    expect(normalizePreferences({ budgetMax: -10 }).budgetMax).toBeNull()
    expect(normalizePreferences({ budgetMax: Number.NaN }).budgetMax).toBeNull()
    expect(normalizePreferences({ budgetMax: 'lots' }).budgetMax).toBeNull()
    expect(normalizePreferences({ budgetMax: 1e12 }).budgetMax).toBe(100_000_000)
  })

  it('upper-cases a valid 3-letter currency and falls back to USD otherwise', () => {
    expect(normalizePreferences({ currency: 'eur' }).currency).toBe('EUR')
    expect(normalizePreferences({ currency: 'US' }).currency).toBe('USD')
    expect(normalizePreferences({ currency: 'dollars' }).currency).toBe('USD')
    expect(normalizePreferences({}).currency).toBe('USD')
  })

  it('trims, dedupes case-insensitively, drops non-strings, and caps categories', () => {
    const out = normalizePreferences({
      categories: ['  Cleaning ', 'cleaning', 'Web Design', 123, '', 'Web   Design'],
    })
    expect(out.categories).toEqual(['Cleaning', 'Web Design'])

    const many = normalizePreferences({ categories: Array.from({ length: 20 }, (_, i) => `cat${i}`) })
    expect(many.categories).toHaveLength(12)

    const longCat = normalizePreferences({ categories: ['x'.repeat(80)] })
    expect(longCat.categories[0]).toHaveLength(40)
  })

  it('accepts only the timing enum', () => {
    expect(normalizePreferences({ timing: 'asap' }).timing).toBe('asap')
    expect(normalizePreferences({ timing: 'this_week' }).timing).toBe('this_week')
    expect(normalizePreferences({ timing: 'someday' }).timing).toBeNull()
    expect(normalizePreferences({ timing: 5 }).timing).toBeNull()
  })

  it('trims/collapses/caps location and nulls empties', () => {
    expect(normalizePreferences({ location: '  Dallas,  TX ' }).location).toBe('Dallas, TX')
    expect(normalizePreferences({ location: '   ' }).location).toBeNull()
    expect(normalizePreferences({ location: 'a'.repeat(100) }).location).toHaveLength(80)
  })

  it('treats voiceRepliesDefault as strictly boolean true', () => {
    expect(normalizePreferences({ voiceRepliesDefault: true }).voiceRepliesDefault).toBe(true)
    expect(normalizePreferences({ voiceRepliesDefault: 'true' }).voiceRepliesDefault).toBe(false)
    expect(normalizePreferences({ voiceRepliesDefault: 1 }).voiceRepliesDefault).toBe(false)
  })

  it('defaults notifications ON; only an explicit false opts out', () => {
    expect(normalizePreferences({}).notificationsEnabled).toBe(true)
    expect(normalizePreferences({ notificationsEnabled: false }).notificationsEnabled).toBe(false)
    expect(normalizePreferences({ notificationsEnabled: 'no' }).notificationsEnabled).toBe(true)
  })

  it('defaults every notification category ON; only an explicit false mutes one', () => {
    expect(normalizePreferences({}).notificationTypes).toEqual({ orders: true, alerts: true, tasks: true })
    expect(normalizePreferences({ notificationTypes: { alerts: false } }).notificationTypes).toEqual({
      orders: true,
      alerts: false,
      tasks: true,
    })
    // Non-false / garbage values stay ON; unknown keys are ignored.
    expect(normalizePreferences({ notificationTypes: { orders: 'no', bogus: false } }).notificationTypes).toEqual({
      orders: true,
      alerts: true,
      tasks: true,
    })
    expect(normalizePreferences({ notificationTypes: 'nope' }).notificationTypes).toEqual({
      orders: true,
      alerts: true,
      tasks: true,
    })
  })
})

describe('preferencesPromptBlock', () => {
  it('is empty when nothing agent-relevant is set (voice default alone does not count)', () => {
    expect(preferencesPromptBlock(DEFAULT_PREFERENCES)).toBe('')
    expect(preferencesPromptBlock(normalizePreferences({ voiceRepliesDefault: true }))).toBe('')
  })

  it('lists only the set fields and never leaks the voice flag', () => {
    const block = preferencesPromptBlock(
      normalizePreferences({
        budgetMax: 500,
        currency: 'usd',
        categories: ['cleaning'],
        timing: 'this_week',
        location: 'Dallas',
        voiceRepliesDefault: true,
      }),
    )
    expect(block).toContain('up to 500 USD')
    expect(block).toContain('Interested in: cleaning')
    expect(block).toContain('within this week')
    expect(block).toContain('Dallas')
    expect(block.toLowerCase()).not.toContain('voice')
    expect(block.toLowerCase()).not.toContain('notif')
  })
})

describe('normalizePreferences - sources selection', () => {
  it('defaults to null (= all available sources) when absent or not an array', () => {
    expect(normalizePreferences({}).sources).toBeNull()
    expect(normalizePreferences({ sources: 'nope' }).sources).toBeNull()
    expect(normalizePreferences({ sources: null }).sources).toBeNull()
  })

  it('treats an empty array as an explicit selection (Nexez only)', () => {
    expect(normalizePreferences({ sources: [] }).sources).toEqual([])
  })

  it('cleans, lowercases, and dedupes source ids; drops junk', () => {
    expect(normalizePreferences({ sources: ['Yelp', 'google_places', 'yelp', 42, '', 'a b!c'] }).sources).toEqual([
      'yelp',
      'google_places',
      'abc',
    ])
  })
})
