import type { OwnerPlanEntitlements } from '@/src/types/nexez'
import { isCurrentMobileEntitlementSnapshot } from './entitlement-snapshot'

const DAY_MS = 86_400_000

/** `null` is the mobile wire value for the canonical epoch-to-now All time range. */
export type MobileAnalyticsRangeDays = 1 | 7 | 30 | 90 | null

export type MobileAnalyticsResult<T> = {
  rollup: T
  effectiveRangeDays: MobileAnalyticsRangeDays
  fullHistory: boolean
  asOf: string
}

type MobileAnalyticsDependencies<T> = {
  getEntitlements: (ownerId: string) => Promise<unknown>
  getRollup: (cutoff: Date) => Promise<T>
}

/**
 * Treat the authenticated entitlement RPC response as a short-lived capability.
 * A failed, stale, cross-owner, or internally inconsistent response must never
 * unlock a history query on the client.
 */
export function allowsMobileAnalyticsHistory(
  value: unknown,
  ownerId: string,
  now: Date = new Date(),
): value is OwnerPlanEntitlements {
  return isCurrentMobileEntitlementSnapshot(value, ownerId, now)
    && value.featurePlanRank >= 2
    && value.features.analyticsHistory === true
}

/** Only product-supported presets can reach the analytics RPC. */
export function effectiveMobileAnalyticsRange(
  requestedRangeDays: number | null,
  fullHistory: boolean,
): MobileAnalyticsRangeDays {
  if (requestedRangeDays === 1 || requestedRangeDays === 7 || requestedRangeDays === 30) {
    return requestedRangeDays
  }
  if (requestedRangeDays === 90 && fullHistory) return 90
  if (requestedRangeDays === null && fullHistory) return null
  return 30
}

/**
 * Resolve the authoritative plan first, clamp before constructing the cutoff,
 * then issue exactly one analytics request for the effective range.
 */
export async function loadMobileAnalytics<T>(
  ownerId: string,
  requestedRangeDays: number | null,
  dependencies: MobileAnalyticsDependencies<T>,
  now: Date = new Date(),
): Promise<MobileAnalyticsResult<T>> {
  let entitlements: unknown = null
  try {
    entitlements = await dependencies.getEntitlements(ownerId)
  } catch {
    // Analytics remains usable for the 30-day baseline when entitlement
    // resolution is unavailable. Longer history stays fail-closed.
  }

  const fullHistory = allowsMobileAnalyticsHistory(entitlements, ownerId, now)
  const effectiveRangeDays = effectiveMobileAnalyticsRange(requestedRangeDays, fullHistory)
  const cutoff = effectiveRangeDays === null
    ? new Date(0)
    : new Date(now.getTime() - effectiveRangeDays * DAY_MS)
  const rollup = await dependencies.getRollup(cutoff)

  return { rollup, effectiveRangeDays, fullHistory, asOf: now.toISOString() }
}
