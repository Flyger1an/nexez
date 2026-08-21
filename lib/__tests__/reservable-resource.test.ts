import { describe, expect, it } from 'vitest'
import type { OfferInputField } from '../offer-configuration'
import {
  resolveResourceRequirementQuantities,
  validateReservableResourceTerms,
} from '../reservable-resource'

const POOL_A = '11111111-1111-4111-8111-111111111111'
const POOL_B = '22222222-2222-4222-8222-222222222222'
const WINDOW_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const inputs: OfferInputField[] = [{
  key: 'guest_count',
  label: 'Guest count',
  valueType: 'quantity',
  required: true,
  askBuyer: 'How many guests?',
}]

describe('reservable resource terms', () => {
  it('canonicalizes fixed and required quantity-input requirements', () => {
    const result = validateReservableResourceTerms({
      schemaVersion: 1,
      requirements: [
        { poolId: POOL_A.toUpperCase(), quantity: { source: 'fixed', value: 2 } },
        { poolId: POOL_B, windowId: WINDOW_A, quantity: { source: 'input', inputKey: 'guest_count' } },
      ],
    }, inputs)
    expect(result).toEqual({
      ok: true,
      value: {
        schemaVersion: 1,
        requirements: [
          { poolId: POOL_A, quantity: { source: 'fixed', value: 2 } },
          { poolId: POOL_B, windowId: WINDOW_A, quantity: { source: 'input', inputKey: 'guest_count' } },
        ],
      },
    })
  })

  it.each([
    [{ schemaVersion: 1, requirements: [] }, 'resource_requirement_count'],
    [{ schemaVersion: 1, requirements: [
      { poolId: POOL_A, quantity: { source: 'fixed', value: 1 } },
      { poolId: POOL_A, quantity: { source: 'fixed', value: 1 } },
    ] }, 'resource_pool_duplicate'],
    [{ schemaVersion: 1, requirements: [{ poolId: 'not-a-uuid', quantity: { source: 'fixed', value: 1 } }] }, 'resource_pool_id'],
    [{ schemaVersion: 1, requirements: [{ poolId: POOL_A, quantity: { source: 'fixed', value: 1.5 } }] }, 'resource_quantity_value'],
    [{ schemaVersion: 1, requirements: [{ poolId: POOL_A, quantity: { source: 'fixed', value: 10_001 } }] }, 'resource_quantity_value'],
    [{ schemaVersion: 1, requirements: [{ poolId: POOL_A, quantity: { source: 'input', inputKey: 'unknown' } }] }, 'resource_quantity_input'],
  ])('rejects unsafe or unbounded contracts %#', (value, code) => {
    expect(validateReservableResourceTerms(value, inputs)).toMatchObject({ ok: false, code })
  })

  it('requires a dynamic quantity to reference a required quantity input', () => {
    const optional = [{ ...inputs[0], required: false }]
    const numeric = [{ ...inputs[0], valueType: 'number' as const }]
    const terms = {
      schemaVersion: 1,
      requirements: [{ poolId: POOL_A, quantity: { source: 'input', inputKey: 'guest_count' } }],
    }
    expect(validateReservableResourceTerms(terms, optional)).toMatchObject({ ok: false, code: 'resource_quantity_input' })
    expect(validateReservableResourceTerms(terms, numeric)).toMatchObject({ ok: false, code: 'resource_quantity_input' })
  })

  it('resolves only canonical integer configuration values', () => {
    const validated = validateReservableResourceTerms({
      schemaVersion: 1,
      requirements: [
        { poolId: POOL_A, quantity: { source: 'fixed', value: 2 } },
        { poolId: POOL_B, windowId: WINDOW_A, quantity: { source: 'input', inputKey: 'guest_count' } },
      ],
    }, inputs)
    if (!validated.ok) throw new Error(validated.error)
    expect(resolveResourceRequirementQuantities(validated.value, { guest_count: 40 })).toMatchObject({
      ok: true,
      value: [{ resolvedQuantity: 2 }, { resolvedQuantity: 40 }],
    })
    expect(resolveResourceRequirementQuantities(validated.value, { guest_count: '40' })).toMatchObject({
      ok: false,
      code: 'resource_quantity_unresolved',
    })
  })
})
