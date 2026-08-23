import { isEntitlementAllocationRetry } from '../../../../lib/entitlement-allocation-error'

type DatabaseWriteError = {
  code?: string | null
  message?: string | null
  hint?: string | null
}

function databaseWriteError(value: unknown): DatabaseWriteError | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as DatabaseWriteError
}

/** Normalize PostgREST's plain-object failures into real Errors so every mobile
 * listing surface can present the same quota/retry contract without an unhandled
 * promise rejection. */
export function toListingWriteError(value: unknown): Error {
  const databaseError = databaseWriteError(value)
  if (isEntitlementAllocationRetry(databaseError)) {
    return new Error('Your plan allocation changed while this update was running. Please try again.')
  }
  if (databaseError?.code === '23514') {
    return new Error([databaseError.message, databaseError.hint].filter(Boolean).join(' ') || 'Your plan limit was reached.')
  }
  if (value instanceof Error) return value
  if (databaseError?.message) return new Error(databaseError.message)
  return new Error('Could not update this listing.')
}

export function listingWriteErrorMessage(value: unknown): string {
  return toListingWriteError(value).message
}
