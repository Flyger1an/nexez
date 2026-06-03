import { describe, expect, it } from 'vitest'
import { buildAgentReadyBadgeSvg } from '../badge'

describe('buildAgentReadyBadgeSvg', () => {
  it('returns an svg with the score and label', () => {
    const svg = buildAgentReadyBadgeSvg(87, false)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('87/100')
    expect(svg).toContain('Agent-Ready')
    expect(svg).toContain('#10B981') // emerald for >=80
  })
  it('shows a check when verified and clamps score', () => {
    const svg = buildAgentReadyBadgeSvg(150, true)
    expect(svg).toContain('100/100')
    expect(svg).toContain('✓')
  })
  it('uses red/amber for lower scores', () => {
    expect(buildAgentReadyBadgeSvg(40)).toContain('#EF4444')
    expect(buildAgentReadyBadgeSvg(60)).toContain('#F59E0B')
  })
})
