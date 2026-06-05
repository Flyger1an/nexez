import { describe, it, expect } from 'vitest'
import {
  detectIntent,
  interpretPublicQuery,
  getDemoPage,
} from '../agent-simulator'

const page = getDemoPage()

describe('agent-simulator: query-aware public simulation', () => {
  it('detects intent across distinct buyer questions', () => {
    expect(detectIntent('Can an agent book a session next week?')).toBe('booking')
    expect(detectIntent('how much does this cost?')).toBe('pricing')
    expect(detectIntent('what products can I buy?')).toBe('product')
    expect(detectIntent('how do I contact you')).toBe('contact')
    expect(detectIntent('is this a good fit for a scaling startup')).toBe('fit')
    expect(detectIntent('tell me about this business')).toBe('overview')
  })

  it('produces DIFFERENT answers for different queries (not a constant response)', () => {
    const booking = interpretPublicQuery(page, 'Can an agent book a 60-minute session next week?')
    const pricing = interpretPublicQuery(page, 'How much does strategy work cost here?')

    expect(booking.intent).toBe('booking')
    expect(pricing.intent).toBe('pricing')
    expect(booking.answer).not.toBe(pricing.answer)
    expect(booking.agentActions).not.toEqual(pricing.agentActions)
  })

  it('echoes the visitor query into the tailored answer', () => {
    const r = interpretPublicQuery(page, 'book a strategy session')
    expect(r.answer).toContain('book a strategy session')
  })

  it('flags exactly one best-match offer and includes its checkout key in the actions', () => {
    const r = interpretPublicQuery(page, 'leadership coaching package')
    const best = r.offers.filter((o) => o.bestMatch)
    expect(best).toHaveLength(1)
    // token overlap on "leadership coaching" should pick that service
    expect(best[0].name.toLowerCase()).toContain('coaching')
    expect(r.agentActions.some((a) => a.includes(`offer: "${best[0].key}"`))).toBe(true)
  })

  it('ranks the matched offer first and reports readiness + confidence', () => {
    const r = interpretPublicQuery(page, 'what products can I buy right now?')
    expect(r.offers[0].bestMatch).toBe(true)
    expect(r.offers[0].type).toBe('product')
    expect(r.readiness).toBeGreaterThan(0)
    expect(r.confidence).toBeGreaterThan(0)
  })
})
