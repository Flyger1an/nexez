import { describe, expect, it } from 'vitest'
import { agenticCommerceStatus } from '../agentic-commerce-status'

const FULL = { published: true, planAllowsCheckout: true, connectReady: true, chatgptLive: true, googleLive: true }

describe('agenticCommerceStatus', () => {
  it('unpublished → both layers off, not eligible', () => {
    expect(agenticCommerceStatus({ ...FULL, published: false })).toEqual({
      discovery: 'unpublished',
      checkout: 'unpublished',
      checkoutEligible: false,
      liveSurfaces: [],
    })
  })

  it('published on Free → discovery live, checkout needs_plan', () => {
    const s = agenticCommerceStatus({ ...FULL, planAllowsCheckout: false })
    expect(s.discovery).toBe('live')
    expect(s.checkout).toBe('needs_plan')
    expect(s.checkoutEligible).toBe(false)
  })

  it('Pro but no payout account → needs_payouts', () => {
    const s = agenticCommerceStatus({ ...FULL, connectReady: false })
    expect(s.checkout).toBe('needs_payouts')
    expect(s.checkoutEligible).toBe(false)
  })

  it('Pro + payouts but BOTH programs dormant → enrolling (ready, owner-blocked)', () => {
    const s = agenticCommerceStatus({ ...FULL, chatgptLive: false, googleLive: false })
    expect(s.checkout).toBe('enrolling')
    expect(s.checkoutEligible).toBe(false)
    expect(s.liveSurfaces).toEqual([])
  })

  it('all gates + both programs live → live on both surfaces', () => {
    expect(agenticCommerceStatus(FULL)).toEqual({ discovery: 'live', checkout: 'live', checkoutEligible: true, liveSurfaces: ['chatgpt', 'google'] })
  })

  it('only ChatGPT enrolled → live but liveSurfaces names ONLY chatgpt (never overstates Google)', () => {
    const s = agenticCommerceStatus({ ...FULL, googleLive: false })
    expect(s.checkout).toBe('live')
    expect(s.liveSurfaces).toEqual(['chatgpt'])
  })

  it('only Google enrolled → liveSurfaces names ONLY google', () => {
    const s = agenticCommerceStatus({ ...FULL, chatgptLive: false })
    expect(s.liveSurfaces).toEqual(['google'])
  })

  it('precedence: the plan blocker is surfaced before the payout blocker', () => {
    // Missing BOTH plan and Connect → the upgrade (revenue lever) is what we show.
    const s = agenticCommerceStatus({ published: true, planAllowsCheckout: false, connectReady: false, chatgptLive: true, googleLive: true })
    expect(s.checkout).toBe('needs_plan')
  })

  it('checkoutEligible is true iff checkout === live', () => {
    for (const inp of [
      FULL,
      { ...FULL, planAllowsCheckout: false },
      { ...FULL, connectReady: false },
      { ...FULL, chatgptLive: false, googleLive: false },
      { ...FULL, published: false },
    ]) {
      const s = agenticCommerceStatus(inp)
      expect(s.checkoutEligible).toBe(s.checkout === 'live')
    }
  })
})
