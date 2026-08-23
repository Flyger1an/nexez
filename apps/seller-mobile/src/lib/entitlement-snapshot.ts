import type { OwnerPlanEntitlements, PlanId } from '@/src/types/nexez'

export const MOBILE_ENTITLEMENT_SNAPSHOT_MAX_AGE_MS = 5 * 60_000
const MOBILE_ENTITLEMENT_SNAPSHOT_FUTURE_SKEW_MS = 5 * 60_000

export const MOBILE_PLAN_RANK: Readonly<Record<PlanId, number>> = {
  free: 0,
  launch: 1,
  pro: 2,
  scale: 3,
  enterprise: 4,
}

export const MOBILE_ENTITLEMENT_FEATURE_KEYS = [
  'customDomain',
  'aiFeatures',
  'removeBadge',
  'whiteLabel',
  'integrations',
  'outboundWebhooks',
  'apiAccess',
  'negotiation',
  'analyticsHistory',
  'teamCollaboration',
  'prioritySupport',
  'sso',
] as const satisfies readonly (keyof OwnerPlanEntitlements['features'])[]

function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MOBILE_PLAN_RANK, value)
}

function hasBooleanFeatureSchema(value: unknown): value is OwnerPlanEntitlements['features'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const features = value as Partial<OwnerPlanEntitlements['features']>
  return MOBILE_ENTITLEMENT_FEATURE_KEYS.every((feature) => typeof features[feature] === 'boolean')
}

/**
 * Shared mobile trust boundary for the authenticated entitlement RPC. Paid UI
 * unlocks require the current viewer, schema version, exact plan/rank pairs,
 * complete boolean feature shape, and a short-lived server evaluation time.
 */
export function isCurrentMobileEntitlementSnapshot(
  value: unknown,
  ownerId: string | null | undefined,
  now: Date = new Date(),
): value is OwnerPlanEntitlements {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if (typeof ownerId !== 'string' || ownerId.length === 0) return false

  const snapshot = value as Partial<OwnerPlanEntitlements>
  const evaluatedAt = typeof snapshot.evaluatedAt === 'string'
    ? Date.parse(snapshot.evaluatedAt)
    : Number.NaN
  const age = now.getTime() - evaluatedAt

  return snapshot.schemaVersion === 1
    && snapshot.ownerId === ownerId
    && isPlanId(snapshot.featurePlanId)
    && snapshot.featurePlanRank === MOBILE_PLAN_RANK[snapshot.featurePlanId]
    && isPlanId(snapshot.commercialPlanId)
    && snapshot.commercialPlanRank === MOBILE_PLAN_RANK[snapshot.commercialPlanId]
    && hasBooleanFeatureSchema(snapshot.features)
    && Number.isFinite(evaluatedAt)
    && age <= MOBILE_ENTITLEMENT_SNAPSHOT_MAX_AGE_MS
    && age >= -MOBILE_ENTITLEMENT_SNAPSHOT_FUTURE_SKEW_MS
}

/** Epoch at which a timestamped snapshot must be re-evaluated and locked. */
export function mobileEntitlementSnapshotExpiresAt(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const evaluatedAt = Date.parse(String((value as { evaluatedAt?: unknown }).evaluatedAt ?? ''))
  return Number.isFinite(evaluatedAt)
    ? evaluatedAt + MOBILE_ENTITLEMENT_SNAPSHOT_MAX_AGE_MS
    : null
}
