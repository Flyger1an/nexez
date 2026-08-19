import { describe, expect, it } from 'vitest'
import type { OfferItem } from '../../agent-page'
import { getOfferCustomerInputs } from '../../configured-offer'
import { applyIntakeAction, createIntakeState, normalizeOfferName } from '../reducer'
import { VOLUNTEERED_PREFIX, type IntakeAction } from '../types'

function seededOffer(): OfferItem {
  return {
    name: 'Mobile Detail',
    description: 'Interior and exterior detail',
    price: '$150',
    url: '',
  }
}

function recordPricing(origin?: 'suggested'): IntakeAction {
  return {
    type: 'RECORD_ANSWERS',
    answers: [{
      gapId: `${VOLUNTEERED_PREFIX}configured-pricing`,
      answer: 'SUVs are $25 more than the base detail.',
      fields: [{
        target: 'offer_input',
        offerKey: 'services-0',
        ...(origin ? { origin } : {}),
        input: {
          key: 'vehicle_class',
          label: 'Vehicle class',
          valueType: 'single-select',
          required: true,
          options: [
            { value: 'sedan', label: 'Sedan' },
            { value: 'suv', label: 'SUV' },
          ],
          askBuyer: 'What kind of vehicle should we detail?',
          affects: ['price', 'duration'],
          pricing: {
            model: 'option-delta',
            adjustments: [{ value: 'suv', delta: '25.00' }],
          },
        },
      }],
    }],
  }
}

describe('intake deterministic pricing provenance', () => {
  it('records and normalizes explicitly stated merchant pricing on the buyer input', () => {
    const original = createIntakeState({ seed: { services: [seededOffer()] } })
    const result = applyIntakeAction(original, recordPricing())
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(getOfferCustomerInputs(result.state.draft.services[0])).toEqual([{
      key: 'vehicle_class',
      label: 'Vehicle class',
      valueType: 'single-select',
      required: true,
      options: [
        { value: 'sedan', label: 'Sedan' },
        { value: 'suv', label: 'SUV' },
      ],
      askBuyer: 'What kind of vehicle should we detail?',
      affects: ['price', 'duration'],
      pricing: {
        model: 'option-delta',
        adjustments: [{ value: 'suv', delta: '25' }],
      },
    }])

    expect(result.state.provenance[
      `offer:${normalizeOfferName('Mobile Detail')}:input:vehicle_class`
    ]).toBe('stated')
  })

  it('records merchant-confirmed suggested pricing as suggested_confirmed, never as agent truth', () => {
    const original = createIntakeState({ seed: { services: [seededOffer()] } })
    const result = applyIntakeAction(original, recordPricing('suggested'))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.state.provenance[
      `offer:${normalizeOfferName('Mobile Detail')}:input:vehicle_class`
    ]).toBe('suggested_confirmed')
    expect(getOfferCustomerInputs(result.state.draft.services[0])[0].pricing).toEqual({
      model: 'option-delta',
      adjustments: [{ value: 'suv', delta: '25' }],
    })
  })

  it('rejects malformed or structurally inconsistent pricing atomically', () => {
    const original = createIntakeState({ seed: { services: [seededOffer()] } })
    const invalid: IntakeAction = {
      type: 'RECORD_ANSWERS',
      answers: [{
        gapId: `${VOLUNTEERED_PREFIX}bad-pricing`,
        answer: 'Bad rule.',
        fields: [{
          target: 'offer_input',
          offerKey: 'services-0',
          input: {
            key: 'vehicle_class',
            label: 'Vehicle class',
            valueType: 'single-select',
            required: true,
            options: [{ value: 'sedan', label: 'Sedan' }],
            askBuyer: 'Vehicle?',
            affects: ['price'],
            pricing: {
              model: 'option-delta',
              adjustments: [{ value: 'suv', delta: '25' }],
            },
          },
        }],
      }],
    }

    const result = applyIntakeAction(original, invalid)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('invalid_field_update')
    expect(getOfferCustomerInputs(original.draft.services[0])).toEqual([])
    expect(original.answers).toEqual([])
  })
})
