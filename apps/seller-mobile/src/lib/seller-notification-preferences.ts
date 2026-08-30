import type {
  SellerNotificationPreferencePatch,
  SellerNotificationPreferences,
} from './api'

export const DEFAULT_SELLER_NOTIFICATION_PREFERENCES: SellerNotificationPreferences = {
  transactions: true,
  negotiations: true,
  integrations: true,
  reviews: true,
  marketing: true,
}

export function normalizeSellerNotificationPreferences(input: unknown): SellerNotificationPreferences | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const source = input as Record<string, unknown>
  if (source.transactions !== true) return null
  if (typeof source.negotiations !== 'boolean'
    || typeof source.integrations !== 'boolean'
    || typeof source.reviews !== 'boolean'
    || typeof source.marketing !== 'boolean') return null
  return {
    transactions: true,
    negotiations: source.negotiations,
    integrations: source.integrations,
    reviews: source.reviews,
    marketing: source.marketing,
  }
}

type LegacyPreferenceKey = 'negotiation' | 'accepted' | 'review' | 'readiness' | 'integration' | 'spike'

const LEGACY_KEYS = new Set<LegacyPreferenceKey>([
  'negotiation',
  'accepted',
  'review',
  'readiness',
  'integration',
  'spike',
])

/**
 * Collapse the original device-only event switches into account categories.
 * A broad category is disabled when any of its legacy sub-events was disabled.
 * The old payment switch is deliberately ignored because money-state notices
 * are required under the seller delivery policy.
 */
export function sellerNotificationPatchFromLegacyStorage(raw: string | null): SellerNotificationPreferencePatch | null {
  if (!raw) return null

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const source = value as Record<string, unknown>
  const recognized = Object.entries(source).filter(
    (entry): entry is [LegacyPreferenceKey, boolean] => LEGACY_KEYS.has(entry[0] as LegacyPreferenceKey) && typeof entry[1] === 'boolean',
  )
  if (!recognized.length) return null

  const legacy = Object.fromEntries(recognized) as Partial<Record<LegacyPreferenceKey, boolean>>
  return {
    negotiations: categoryValue([legacy.negotiation, legacy.accepted]),
    integrations: categoryValue([legacy.integration]),
    reviews: categoryValue([legacy.review]),
    marketing: categoryValue([legacy.readiness, legacy.spike]),
  }
}

function categoryValue(values: (boolean | undefined)[]): boolean {
  return !values.some((value) => value === false)
}
