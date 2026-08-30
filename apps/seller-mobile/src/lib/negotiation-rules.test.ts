import { describe, expect, it } from 'vitest'
import type { OfferItem } from '@/src/types/nexez'
import {
  applyMobileNegotiationRuleDraft,
  mobileNegotiationRuleDraft,
  validateMobileNegotiationRuleDraft,
} from './negotiation-rules'

const offer: OfferItem = {
  name: 'Brand package',
  description: 'Identity work',
  price: '$1,000',
  metadata: { sourceId: 'offer-1' },
  offerType: 'negotiable',
  rules: {
    minPrice: '$800',
    maxDiscountPercent: 20,
    autoAccept: true,
    autoAcceptWithinPercent: 5,
    autoCounter: true,
    includedScope: 'Logo and brand guide',
    excludedScope: 'Website development',
    maxRevisions: 2,
    maxProjectWeeks: 4,
    minNoticeHours: 48,
    autoSettleMax: '$2,000',
    futureRule: 'preserve',
  } as never,
}

describe('mobile negotiation rule authoring', () => {
  it('hydrates every canonical field from one offer', () => {
    expect(mobileNegotiationRuleDraft(offer)).toEqual({
      enabled: true,
      initialEnabled: true,
      enabledChanged: false,
      minPrice: '$800',
      maxDiscountPercent: '20',
      autoAccept: true,
      autoAcceptWithinPercent: '5',
      autoCounter: true,
      includedScope: 'Logo and brand guide',
      excludedScope: 'Website development',
      maxRevisions: '2',
      maxProjectWeeks: '4',
    })
  })

  it('writes platform-equivalent values without dropping unrelated metadata or rules', () => {
    const draft = {
      ...mobileNegotiationRuleDraft(offer),
      minPrice: ' $850 ',
      maxDiscountPercent: '15',
      autoAcceptWithinPercent: '3',
      includedScope: ' Logo, guide, templates ',
      maxRevisions: '3',
    }
    const result = applyMobileNegotiationRuleDraft(offer, draft, true)

    expect(result).toEqual({
      ok: true,
      offer: {
        ...offer,
        rules: {
          minNoticeHours: 48,
          autoSettleMax: '$2,000',
          futureRule: 'preserve',
          minPrice: '$850',
          maxDiscountPercent: 15,
          autoAccept: true,
          autoAcceptWithinPercent: 3,
          autoCounter: true,
          includedScope: 'Logo, guide, templates',
          excludedScope: 'Website development',
          maxRevisions: 3,
          maxProjectWeeks: 4,
        },
      },
    })
  })

  it('lets a downgraded owner edit core scope while retaining paid rules unchanged', () => {
    const draft = { ...mobileNegotiationRuleDraft(offer), includedScope: 'Logo only' }
    const result = applyMobileNegotiationRuleDraft(offer, draft, false)

    expect(result).toMatchObject({
      ok: true,
      offer: {
        offerType: 'negotiable',
        metadata: { sourceId: 'offer-1' },
        rules: {
          minPrice: '$800',
          maxDiscountPercent: 20,
          autoAccept: true,
          autoAcceptWithinPercent: 5,
          autoCounter: true,
          includedScope: 'Logo only',
          autoSettleMax: '$2,000',
          futureRule: 'preserve',
        },
      },
    })
  })

  it('clears only paid negotiation configuration when explicitly disabled', () => {
    const result = applyMobileNegotiationRuleDraft(
      offer,
      { ...mobileNegotiationRuleDraft(offer), enabled: false, enabledChanged: true },
      false,
    )

    expect(result).toEqual({
      ok: true,
      offer: {
        name: 'Brand package',
        description: 'Identity work',
        price: '$1,000',
        metadata: { sourceId: 'offer-1' },
        rules: {
          includedScope: 'Logo and brand guide',
          excludedScope: 'Website development',
          maxRevisions: 2,
          maxProjectWeeks: 4,
          minNoticeHours: 48,
          futureRule: 'preserve',
        },
      },
    })
  })

  it('preserves retained paid fields on a fixed offer until cleanup is explicit', () => {
    const fixedWithRetainedRules: OfferItem = {
      ...offer,
      offerType: undefined,
    }
    const draft = mobileNegotiationRuleDraft(fixedWithRetainedRules)

    expect(applyMobileNegotiationRuleDraft(fixedWithRetainedRules, draft, false)).toEqual({
      ok: true,
      offer: fixedWithRetainedRules,
    })
  })

  it.each([
    [{ maxDiscountPercent: '101' }, 'Maximum discount must be a number from 0 to 100.'],
    [{ autoAcceptWithinPercent: '-1' }, 'Auto-accept range must be a number from 0 to 100.'],
    [{ maxRevisions: '1.5' }, 'Included revisions must be a whole number from 0 to 1000.'],
    [{ maxProjectWeeks: '0' }, 'Maximum project length must be a whole number from 1 to 1000.'],
    [{ minPrice: 'free' }, 'Minimum acceptable price must include a number.'],
  ])('rejects misconfigured platform rules before saving', (patch, message) => {
    const result = validateMobileNegotiationRuleDraft({
      ...mobileNegotiationRuleDraft(offer),
      ...patch,
    })
    expect(result).toEqual({ ok: false, message })
  })
})
