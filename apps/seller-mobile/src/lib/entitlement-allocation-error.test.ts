import { describe, expect, it } from 'vitest'
import {
  ENTITLEMENT_ALLOCATION_RETRY_MESSAGE,
  ENTITLEMENT_ALLOCATION_RETRY_SQLSTATE,
  isEntitlementAllocationRetry,
} from './entitlement-allocation-error'

describe('mobile entitlement allocation error contract', () => {
  it('matches the stable database retry contract', () => {
    expect(ENTITLEMENT_ALLOCATION_RETRY_SQLSTATE).toBe('40001')
    expect(ENTITLEMENT_ALLOCATION_RETRY_MESSAGE).toBe('NEXEZ_ENTITLEMENT_ALLOCATION_RETRY')
    expect(isEntitlementAllocationRetry({
      code: ENTITLEMENT_ALLOCATION_RETRY_SQLSTATE,
      message: `ERROR: ${ENTITLEMENT_ALLOCATION_RETRY_MESSAGE}`,
    })).toBe(true)
  })

  it('does not treat unrelated serialization failures as allocation retries', () => {
    expect(isEntitlementAllocationRetry({ code: '40001', message: 'unrelated failure' })).toBe(false)
    expect(isEntitlementAllocationRetry(null)).toBe(false)
  })
})
