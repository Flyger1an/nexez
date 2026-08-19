import { describe, expect, it } from 'vitest'
import { validateOfferAttribute, validateOfferInputField } from '../offer-configuration'

describe('public offer configuration safety', () => {
  it('rejects owner-private negotiation policy when encoded as a public attribute', () => {
    for (const key of [
      'min_price',
      'max_discount_percent',
      'auto_accept',
      'auto_accept_within_percent',
      'auto_settle_max',
    ]) {
      const result = validateOfferAttribute({
        key,
        label: 'Should remain private',
        valueType: 'text',
        value: 'private',
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/private negotiation policy/i)
    }
  })

  it('rejects credential and payment secrets from public attributes, including provider-prefixed keys', () => {
    for (const key of ['client_secret', 'stripe_secret_key', 'access_token', 'credit_card_number', 'routing_number']) {
      const result = validateOfferAttribute({
        key,
        label: 'Sensitive',
        valueType: 'text',
        value: 'do-not-publish',
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/sensitive/i)
    }
  })

  it('does not let offer input definitions turn checkout into a credential or payment-data collector', () => {
    for (const key of ['password', 'api_key', 'card_number', 'cvv', 'ssn', 'bank_account_number']) {
      const result = validateOfferInputField({
        key,
        label: 'Sensitive buyer input',
        valueType: 'text',
        required: true,
        askBuyer: 'Provide this sensitive value.',
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/must not collect/i)
    }
  })

  it('keeps ordinary public business facts and buyer requirements valid', () => {
    expect(validateOfferAttribute({
      key: 'water_required',
      label: 'Customer water required',
      valueType: 'boolean',
      value: false,
    }).ok).toBe(true)

    expect(validateOfferInputField({
      key: 'vehicle_class',
      label: 'Vehicle class',
      valueType: 'text',
      required: true,
      askBuyer: 'What vehicle class should we detail?',
    }).ok).toBe(true)
  })
})
