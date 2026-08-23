import { describe, expect, it } from 'vitest'
import {
  ENTITLEMENT_ALLOCATION_RETRY_MESSAGE,
  isEntitlementAllocationRetry,
} from '../entitlement-allocation-error'
import { publishErrorMessage } from '../publish-error'

describe('isEntitlementAllocationRetry', () => {
  it('recognizes only the stable retryable allocation contract', () => {
    expect(isEntitlementAllocationRetry({ code: '40001', message: ENTITLEMENT_ALLOCATION_RETRY_MESSAGE })).toBe(true)
    expect(isEntitlementAllocationRetry({ code: '40001', message: `ERROR: ${ENTITLEMENT_ALLOCATION_RETRY_MESSAGE}` })).toBe(true)
    expect(isEntitlementAllocationRetry({ code: '40001', message: 'unrelated serialization failure' })).toBe(false)
    expect(isEntitlementAllocationRetry({ code: '23514', message: ENTITLEMENT_ALLOCATION_RETRY_MESSAGE })).toBe(false)
    expect(isEntitlementAllocationRetry(null)).toBe(false)
  })

  it('gives direct dashboard publishing a retry message instead of an upgrade message', () => {
    expect(publishErrorMessage({
      code: '40001',
      message: ENTITLEMENT_ALLOCATION_RETRY_MESSAGE,
    })).toMatch(/try again/i)
  })
})
