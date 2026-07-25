import { describe, expect, it } from 'vitest'
import { buildAgentReadyBadgeSvg } from '../badge'

describe('buildAgentReadyBadgeSvg', () => {
  it('returns a readiness badge without making a certification claim', () => {
    const svg = buildAgentReadyBadgeSvg(87, false)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('87/100')
    expect(svg).toContain('Agent readiness')
    expect(svg).not.toContain('Nexez Certified')
    expect(svg).toContain('#10B981') // emerald for >=80
  })
  it('shows the certified claim only when explicitly certified', () => {
    const svg = buildAgentReadyBadgeSvg(100, false, true)
    expect(svg).toContain('Nexez Certified')
    expect(svg).toContain('Nexez Certified Agent-Ready')
  })
  it('shows a check when identity is verified and clamps score', () => {
    const svg = buildAgentReadyBadgeSvg(150, true, true)
    expect(svg).toContain('100/100')
    expect(svg).toContain('✓')
  })
  it('uses red/amber for lower scores', () => {
    expect(buildAgentReadyBadgeSvg(40)).toContain('#EF4444')
    expect(buildAgentReadyBadgeSvg(60)).toContain('#F59E0B')
  })
})
