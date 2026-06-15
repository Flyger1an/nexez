import { describe, it, expect } from 'vitest'
import { analyticsRangeBounds, clampHistoryRange, parseYmd } from '../analytics'

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

  it('"today" cuts off at the start of the current day (midnight → now)', () => {
    const { cutoff, until, preset } = analyticsRangeBounds({ range: 'today' }, NOW)
    expect(preset).toBe('today')
    expect(until).toBeNull()
    // Start of NOW's calendar day, and never after now.
    expect(cutoff.getHours()).toBe(0)
    expect(cutoff.getMinutes()).toBe(0)
    expect(cutoff.getSeconds()).toBe(0)
    expect(cutoff.getMilliseconds()).toBe(0)
    expect(cutoff.getTime()).toBeLessThanOrEqual(NOW.getTime())
    expect(cutoff.getFullYear()).toBe(NOW.getFullYear())
    expect(cutoff.getMonth()).toBe(NOW.getMonth())
    expect(cutoff.getDate()).toBe(NOW.getDate())
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

describe('clampHistoryRange (analyticsHistory Pro gate)', () => {
  it('passes everything through untouched for full-history (Pro+) plans', () => {
    expect(clampHistoryRange({ range: 'all' }, true)).toEqual({ range: 'all', from: undefined, to: undefined })
    expect(clampHistoryRange({ range: '7d', from: '2026-01-01', to: '2026-02-01' }, true)).toEqual({
      range: '7d',
      from: '2026-01-01',
      to: '2026-02-01',
    })
  })

  it('leaves the free presets (today/1d/7d/30d) alone for lower tiers', () => {
    for (const range of ['today', '1d', '7d', '30d']) {
      expect(clampHistoryRange({ range }, false)).toEqual({ range, from: undefined, to: undefined })
    }
  })

  it('clamps the all-time preset down to 30d for lower tiers', () => {
    expect(clampHistoryRange({ range: 'all' }, false)).toEqual({ range: '30d', from: undefined, to: undefined })
  })

  it('clamps ANY unrecognized range string down to 30d for lower tiers (no epoch-cutoff bypass)', () => {
    // analyticsRangeBounds defaults an unknown preset to an epoch (all-time)
    // cutoff, so the gate must allowlist the free presets, not just block "all".
    for (const range of ['90d', '60d', '365d', '1y', 'foo', '']) {
      expect(clampHistoryRange({ range }, false)).toEqual({ range: '30d', from: undefined, to: undefined })
    }
    // undefined (no range param) likewise clamps to the default window.
    expect(clampHistoryRange({ range: undefined }, false)).toEqual({ range: '30d', from: undefined, to: undefined })
  })

  it('still passes unrecognized ranges through untouched for full-history (Pro+) plans', () => {
    expect(clampHistoryRange({ range: '90d' }, true)).toEqual({ range: '90d', from: undefined, to: undefined })
  })

  it('drops a custom from/to range (even a single open bound) for lower tiers', () => {
    expect(clampHistoryRange({ range: '7d', from: '2020-01-01' }, false)).toEqual({
      range: '30d',
      from: undefined,
      to: undefined,
    })
    expect(clampHistoryRange({ to: '2026-01-01' }, false)).toEqual({ range: '30d', from: undefined, to: undefined })
  })
})
