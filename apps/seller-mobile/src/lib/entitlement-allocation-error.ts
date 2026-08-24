export const ENTITLEMENT_ALLOCATION_RETRY_SQLSTATE = '40001'
export const ENTITLEMENT_ALLOCATION_RETRY_MESSAGE = 'NEXEZ_ENTITLEMENT_ALLOCATION_RETRY'

type DatabaseError = { code?: string | null; message?: string | null }

/** Keep the native bundle independent from the Next.js server tree while
 * honoring the same stable database error contract. */
export function isEntitlementAllocationRetry(
  error: DatabaseError | null | undefined,
): boolean {
  return Boolean(
    error?.code === ENTITLEMENT_ALLOCATION_RETRY_SQLSTATE
      && error.message?.includes(ENTITLEMENT_ALLOCATION_RETRY_MESSAGE),
  )
}
