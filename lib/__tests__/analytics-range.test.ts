import { describe, it, expect } from 'vitest'
import { analyticsRangeBounds, parseYmd } from '../analytics'

const NOW = new Date('2026-06-05T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000

describe('analyticsRangeBounds', () => {
  it('defaults to a 30-day preset window', () => {
    const { cutoff, until, isCustom, preset } = analyticsRangeBounds({}, NOW)
    expect(preset).toBe('30d')
    expect(isCustom).toBe(false)
    expect(until).toBeNull()
    expect(NOW.getTime() - cutoff.getTime()).toBe(30 * DAY)
  })

  it('supports a 1-day preset', () => {
    const { cutoff, preset } = analyticsRangeBounds({ range: '1d' }, NOW)
    expect(preset).toBe('1d')
    expect(NOW.getTime() - cutoff.getTime()).toBe(DAY)
  })

  it('"all" returns an epoch cutoff and no upper bound', () => {
    const { cutoff, until } = analyticsRangeBounds({ range: 'all' }, NOW)
    expect(cutoff.getTime()).toBe(0)
    expect(until).toBeNull()
  })

  it('custom from/to range takes precedence over the preset and is inclusive end-of-day', () => {
    const { cutoff, until, isCustom } = analyticsRangeBounds(
      { range: '7d', from: '2026-05-01', to: '2026-05-31' },
      NOW,
    )
    expect(isCustom).toBe(true)
    expect(cutoff).toEqual(new Date('2026-05-01T00:00:00'))
    // end of day, local time
    expect(until?.getHours()).toBe(23)
    expect(until?.getMinutes()).toBe(59)
  })

  it('a single open bound (from only) still counts as custom', () => {
    const { cutoff, until, isCustom } = analyticsRangeBounds({ from: '2026-05-10' }, NOW)
    expect(isCustom).toBe(true)
    expect(cutoff).toEqual(new Date('2026-05-10T00:00:00'))
    expect(until).toBeNull()
  })

  it('ignores malformed dates and falls back to the preset', () => {
    expect(parseYmd('not-a-date')).toBeNull()
    expect(parseYmd('2026/05/01')).toBeNull()
    const { isCustom, preset } = analyticsRangeBounds({ range: '7d', from: 'garbage' }, NOW)
    expect(isCustom).toBe(false)
    expect(preset).toBe('7d')
  })
})
