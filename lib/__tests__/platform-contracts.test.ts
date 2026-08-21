import { describe, expect, it } from 'vitest'
import { ownerNegotiationDecisionSchema } from '../contracts/negotiation'
import { ANALYTICS_TRUST_LEVELS, CONVERSION_STAGES } from '../contracts/analytics'
import { TRANSACTION_CHANNELS, isoCurrencyCodeSchema } from '../contracts/money'

describe('Pass 1 shared contracts', () => {
  it('accepts canonical integer-minor owner decisions', () => {
    expect(ownerNegotiationDecisionSchema.parse({
      action: 'counter',
      reasoning: 'A scoped counter.',
      counter: { priceCents: 125_00 },
    })).toMatchObject({ action: 'counter', counter: { priceCents: 125_00 } })
  })

  it('rejects ambiguous major-unit and fractional money fields', () => {
    expect(ownerNegotiationDecisionSchema.safeParse({
      action: 'counter',
      reasoning: 'Legacy payload.',
      proposed_price: 125,
    }).success).toBe(false)
    expect(ownerNegotiationDecisionSchema.safeParse({
      action: 'counter',
      reasoning: 'Fractional cents.',
      counter: { priceCents: 125.5 },
    }).success).toBe(false)
  })

  it('keeps analytics, channel, and currency vocabulary explicit', () => {
    expect(CONVERSION_STAGES).toEqual([
      'offer_viewed',
      'checkout_initiated',
      'payment_completed',
      'payment_retained',
    ])
    expect(ANALYTICS_TRUST_LEVELS).toContain('verified_server')
    expect(TRANSACTION_CHANNELS).toContain('negotiation')
    expect(isoCurrencyCodeSchema.parse('USD')).toBe('usd')
    expect(isoCurrencyCodeSchema.safeParse('dollars').success).toBe(false)
  })
})
