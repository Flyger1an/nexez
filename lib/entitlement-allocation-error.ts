/** Stable database contract for a plan-allocation write that lost a serialization
 * race. This is deliberately distinct from a quota violation: callers should retry
 * it, not tell the seller they need a larger plan. */
export const ENTITLEMENT_ALLOCATION_RETRY_SQLSTATE = '40001'
export const ENTITLEMENT_ALLOCATION_RETRY_MESSAGE = 'NEXEZ_ENTITLEMENT_ALLOCATION_RETRY'

type DatabaseError = { code?: string | null; message?: string | null }

export function isEntitlementAllocationRetry(
  error: DatabaseError | null | undefined,
): boolean {
  return Boolean(
    error?.code === ENTITLEMENT_ALLOCATION_RETRY_SQLSTATE
      && error.message?.includes(ENTITLEMENT_ALLOCATION_RETRY_MESSAGE),
  )
}

export const entitlementAllocationRetryBody = {
  error: 'Your plan allocation changed while this request was running. Please retry.',
  code: 'entitlement_allocation_retry',
  retryable: true,
} as const

export const entitlementAllocationRetryInit = {
  status: 409,
  headers: { 'Retry-After': '1' },
} as const
