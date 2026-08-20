import { describe, expect, it } from 'vitest'
import {
  evaluateConditionalFulfillment,
  fulfillmentOperatorsForInput,
  validateOfferFulfillmentRules,
} from '../conditional-fulfillment'
import type { OfferInputField } from '../offer-configuration'

const inputs: OfferInputField[] = [
  {
    key: 'property_type',
    label: 'Property type',
    valueType: 'single-select',
    required: true,
    options: [
      { value: 'house', label: 'House' },
      { value: 'apartment', label: 'Apartment' },
      { value: 'commercial', label: 'Commercial' },
    ],
    askBuyer: 'What kind of property is this?',
    affects: ['eligibility'],
  },
  {
    key: 'pet_count',
    label: 'Pet count',
    valueType: 'quantity',
    required: true,
    askBuyer: 'How many pets?',
    affects: ['eligibility'],
  },
  {
    key: 'medications',
    label: 'Medication instructions',
    valueType: 'asset',
    required: true,
    askBuyer: 'Provide medication instructions.',
    affects: ['scope'],
  },
  {
    key: 'extras',
    label: 'Extras',
    valueType: 'multi-select',
    required: true,
    options: [
      { value: 'overnight', label: 'Overnight' },
      { value: 'injections', label: 'Injections' },
      { value: 'key_access', label: 'Key access' },
    ],
    askBuyer: 'Which extras apply?',
    affects: ['eligibility'],
  },
  {
    key: 'optional_note',
    label: 'Optional note',
    valueType: 'text',
    required: false,
    askBuyer: 'Anything else?',
  },
]

describe('conditional fulfillment', () => {
  it('keeps operator vocabulary constrained by buyer input type', () => {
    expect(fulfillmentOperatorsForInput(inputs[0]!)).toEqual(['equals', 'in'])
    expect(fulfillmentOperatorsForInput(inputs[1]!)).toEqual(['equals', 'lt', 'lte', 'gt', 'gte'])
    expect(fulfillmentOperatorsForInput(inputs[2]!)).toEqual(['present'])
    expect(fulfillmentOperatorsForInput(inputs[3]!)).toEqual(['contains', 'contains-any', 'contains-all'])
  })

  it('validates and canonicalizes merchant-authored rules against required inputs', () => {
    const result = validateOfferFulfillmentRules([
      {
        id: 'commercial-review',
        inputKey: 'property_type',
        operator: 'in',
        value: ['commercial', 'house', 'commercial'],
        decision: 'requires-review',
        reasonCode: 'scope.manual_review',
        message: 'This property type needs merchant review.',
        nextAction: 'send-proposal',
      },
    ], inputs)

    expect(result).toEqual({
      ok: true,
      value: [{
        id: 'commercial-review',
        inputKey: 'property_type',
        operator: 'in',
        value: ['house', 'commercial'],
        decision: 'requires-review',
        reasonCode: 'scope.manual_review',
        message: 'This property type needs merchant review.',
        nextAction: 'send-proposal',
      }],
    })
  })

  it('rejects optional-input references, invalid operator/type pairs, and undeclared options', () => {
    expect(validateOfferFulfillmentRules([
      { id: 'bad', inputKey: 'optional_note', operator: 'present', decision: 'ineligible', reasonCode: 'bad', message: 'No.' },
    ], inputs)).toMatchObject({ ok: false })

    expect(validateOfferFulfillmentRules([
      { id: 'bad', inputKey: 'pet_count', operator: 'contains', value: 'overnight', decision: 'ineligible', reasonCode: 'bad', message: 'No.' },
    ], inputs)).toMatchObject({ ok: false })

    expect(validateOfferFulfillmentRules([
      { id: 'bad', inputKey: 'property_type', operator: 'equals', value: 'castle', decision: 'ineligible', reasonCode: 'bad', message: 'No.' },
    ], inputs)).toMatchObject({ ok: false })
  })

  it('evaluates exact merchant predicates and lets ineligible outrank review', () => {
    const validated = validateOfferFulfillmentRules([
      {
        id: 'large-pack-review',
        inputKey: 'pet_count',
        operator: 'gte',
        value: 3,
        decision: 'requires-review',
        reasonCode: 'pet_count.review',
        message: 'Three or more pets require review.',
      },
      {
        id: 'injections-blocked',
        inputKey: 'extras',
        operator: 'contains',
        value: 'injections',
        decision: 'ineligible',
        reasonCode: 'care.injections_unsupported',
        message: 'Injection care is not offered.',
        nextAction: 'contact-merchant',
      },
    ], inputs)
    if (!validated.ok) throw new Error(validated.error)

    const evaluation = evaluateConditionalFulfillment(validated.value, {
      property_type: 'house',
      pet_count: 4,
      medications: 'asset://instructions',
      extras: ['overnight', 'injections'],
    })

    expect(evaluation).toEqual({
      schemaVersion: 1,
      policyRules: validated.value,
      decision: 'ineligible',
      matchedRuleIds: ['large-pack-review', 'injections-blocked'],
      reasons: [
        {
          ruleId: 'large-pack-review', inputKey: 'pet_count', decision: 'requires-review',
          reasonCode: 'pet_count.review', message: 'Three or more pets require review.',
        },
        {
          ruleId: 'injections-blocked', inputKey: 'extras', decision: 'ineligible',
          reasonCode: 'care.injections_unsupported', message: 'Injection care is not offered.', nextAction: 'contact-merchant',
        },
      ],
    })
  })

  it('defaults to eligible while preserving the exact evaluated policy in JSON-safe provenance', () => {
    const validated = validateOfferFulfillmentRules([
      {
        id: 'commercial-review',
        inputKey: 'property_type',
        operator: 'equals',
        value: 'commercial',
        decision: 'requires-review',
        reasonCode: 'scope.review',
        message: 'Review required.',
      },
    ], inputs)
    if (!validated.ok) throw new Error(validated.error)

    const result = evaluateConditionalFulfillment(validated.value, {
      property_type: 'house', pet_count: 1, medications: 'asset://instructions', extras: ['key_access'],
    })
    expect(result).toEqual({
      schemaVersion: 1,
      policyRules: validated.value,
      decision: 'eligible',
      matchedRuleIds: [],
      reasons: [],
    })
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
  })
})