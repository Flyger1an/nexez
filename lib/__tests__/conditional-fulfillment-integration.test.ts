import { describe, expect, it } from 'vitest'
import { buildAgentOfferConfiguration } from '../agent-offer-configuration'
import {
  formatConfiguredOfferLines,
  getOfferFulfillmentRules,
  mergeProposedOfferPreservingConfiguration,
  parseConfiguredOfferLines,
} from '../configured-offer'
import { validateOfferTransactionConfiguration } from '../offer-transaction-configuration'
import { buildRecurringServiceAgreementSnapshot } from '../recurring-service'

const baseOffer = {
  name: 'Pet Care Visit',
  description: 'In-home pet care.',
  price: '$80',
  url: '',
  customerInputs: [
    {
      key: 'pet_count',
      label: 'Pet count',
      valueType: 'quantity',
      required: true,
      askBuyer: 'How many pets need care?',
      affects: ['eligibility'],
    },
    {
      key: 'care_type',
      label: 'Care type',
      valueType: 'single-select',
      required: true,
      options: [
        { value: 'standard', label: 'Standard care' },
        { value: 'injections', label: 'Injection care' },
      ],
      askBuyer: 'What type of care is needed?',
      affects: ['eligibility'],
    },
  ],
  fulfillmentRules: [
    {
      id: 'large-pack-review',
      inputKey: 'pet_count',
      operator: 'gte',
      value: 4,
      decision: 'requires-review',
      reasonCode: 'capacity.large_pack',
      message: 'Four or more pets require merchant review.',
      nextAction: 'contact-merchant',
    },
    {
      id: 'injection-block',
      inputKey: 'care_type',
      operator: 'equals',
      value: 'injections',
      decision: 'ineligible',
      reasonCode: 'care.injections_unsupported',
      message: 'Injection care is not offered.',
    },
  ],
} as any

describe('conditional fulfillment integration', () => {
  it('round-trips merchant rules through configured offer persistence', () => {
    const encoded = formatConfiguredOfferLines([baseOffer])
    expect(encoded).toContain('[[FULFILLMENT]]')

    const parsed = parseConfiguredOfferLines(encoded)[0]!
    expect(getOfferFulfillmentRules(parsed)).toEqual(baseOffer.fulfillmentRules)
  })

  it('preserves merchant fulfillment truth across model-proposed offer edits', () => {
    const merged = mergeProposedOfferPreservingConfiguration(baseOffer, {
      name: 'Pet Care Visit',
      description: 'AI rewrote this description.',
      price: '$90',
      url: '',
      fulfillmentRules: [{ id: 'model-made-up-rule' }],
    } as any)

    expect(merged.description).toBe('AI rewrote this description.')
    expect(getOfferFulfillmentRules(merged)).toEqual(baseOffer.fulfillmentRules)
  })

  it('evaluates eligible, review-required, and ineligible buyer configurations after canonical validation', () => {
    const eligible = validateOfferTransactionConfiguration(baseOffer, { pet_count: 2, care_type: 'standard' })
    expect(eligible.ok && eligible.fulfillment.decision).toBe('eligible')

    const review = validateOfferTransactionConfiguration(baseOffer, { pet_count: 5, care_type: 'standard' })
    expect(review.ok && review.fulfillment).toMatchObject({
      decision: 'requires-review',
      matchedRuleIds: ['large-pack-review'],
    })

    const blocked = validateOfferTransactionConfiguration(baseOffer, { pet_count: 5, care_type: 'injections' })
    expect(blocked.ok && blocked.fulfillment).toMatchObject({
      decision: 'ineligible',
      matchedRuleIds: ['large-pack-review', 'injection-block'],
    })
  })

  it('publishes exact merchant rules to agents without materializing a buyer decision', () => {
    const contract = buildAgentOfferConfiguration(baseOffer) as any
    expect(contract.conditional_fulfillment.schema_version).toBe(1)
    expect(contract.conditional_fulfillment.rules).toEqual(baseOffer.fulfillmentRules)
    expect(contract.conditional_fulfillment.possible_decisions).toEqual(['eligible', 'requires-review', 'ineligible'])
    expect(contract.checkout.conditional_fulfillment_requires_nexez_settlement).toBe(true)
    expect(contract.checkout.note).toContain('merchant-authored fulfillment gates')
  })

  it('embeds only eligible fulfillment provenance into new recurring agreement snapshots', () => {
    const eligible = validateOfferTransactionConfiguration(baseOffer, { pet_count: 2, care_type: 'standard' })
    if (!eligible.ok) throw new Error('fixture configuration should validate')

    const terms = {
      schemaVersion: 1,
      paymentModel: 'fixed-per-period',
      schedule: { mode: 'fixed', cadence: { interval: 'week', intervalCount: 1 } },
      startPolicy: 'first-successful-payment',
      endPolicy: 'until-cancelled',
      cancellationPolicy: 'period-end',
      pausePolicy: 'unsupported',
    } as const

    const snapshot = buildRecurringServiceAgreementSnapshot({
      terms,
      configuration: eligible.value,
      fulfillment: eligible.fulfillment,
      pricing: null,
      amountPerPeriod: 8000,
      currency: 'usd',
    })
    expect(snapshot.ok && snapshot.value.fulfillment).toEqual(eligible.fulfillment)

    const review = validateOfferTransactionConfiguration(baseOffer, { pet_count: 5, care_type: 'standard' })
    if (!review.ok) throw new Error('fixture configuration should validate')
    const blocked = buildRecurringServiceAgreementSnapshot({
      terms,
      configuration: review.value,
      fulfillment: review.fulfillment,
      pricing: null,
      amountPerPeriod: 8000,
      currency: 'usd',
    })
    expect(blocked).toMatchObject({ ok: false, code: 'fulfillment_review_required' })
  })
})
