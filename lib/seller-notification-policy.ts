export const SELLER_NOTIFICATION_CATEGORIES = [
  'transactions',
  'negotiations',
  'integrations',
  'reviews',
  'marketing',
] as const

export type SellerNotificationCategory = (typeof SELLER_NOTIFICATION_CATEGORIES)[number]
export type MutableSellerNotificationCategory = Exclude<SellerNotificationCategory, 'transactions'>

export const MUTABLE_SELLER_NOTIFICATION_CATEGORIES = [
  'negotiations',
  'integrations',
  'reviews',
  'marketing',
] as const satisfies readonly MutableSellerNotificationCategory[]

export type SellerNotificationPreferences = Record<SellerNotificationCategory, boolean>
export type SellerNotificationPreferencePatch = Partial<Record<MutableSellerNotificationCategory, boolean>>

export type SellerNotificationEvent =
  | 'transaction.payment_received'
  | 'transaction.payment_held'
  | 'transaction.booking_confirmed'
  | 'transaction.capture_completed'
  | 'transaction.refund_updated'
  | 'transaction.dispute_updated'
  | 'negotiation.created'
  | 'negotiation.buyer_accepted'
  | 'integration.failed'
  | 'integration.recovered'
  | 'review.created'
  | 'review.moderated'
  | 'marketing.readiness_changed'
  | 'marketing.traffic_spike'
  | 'marketing.product_update'

const EVENT_CATEGORIES: Record<SellerNotificationEvent, SellerNotificationCategory> = {
  'transaction.payment_received': 'transactions',
  'transaction.payment_held': 'transactions',
  'transaction.booking_confirmed': 'transactions',
  'transaction.capture_completed': 'transactions',
  'transaction.refund_updated': 'transactions',
  'transaction.dispute_updated': 'transactions',
  'negotiation.created': 'negotiations',
  'negotiation.buyer_accepted': 'negotiations',
  'integration.failed': 'integrations',
  'integration.recovered': 'integrations',
  'review.created': 'reviews',
  'review.moderated': 'reviews',
  'marketing.readiness_changed': 'marketing',
  'marketing.traffic_spike': 'marketing',
  'marketing.product_update': 'marketing',
}

export const DEFAULT_SELLER_NOTIFICATION_PREFERENCES: SellerNotificationPreferences = {
  transactions: true,
  negotiations: true,
  integrations: true,
  reviews: true,
  marketing: true,
}

export function isSellerNotificationPreferences(input: unknown): input is SellerNotificationPreferences {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false
  const source = input as Record<string, unknown>
  return source.transactions === true
    && MUTABLE_SELLER_NOTIFICATION_CATEGORIES.every((category) => typeof source[category] === 'boolean')
}

export type SellerNotificationPreferencesRow = {
  user_id: string
  negotiations_enabled: boolean
  integrations_enabled: boolean
  reviews_enabled: boolean
  marketing_enabled: boolean
}

const CATEGORY_COLUMNS = {
  negotiations: 'negotiations_enabled',
  integrations: 'integrations_enabled',
  reviews: 'reviews_enabled',
  marketing: 'marketing_enabled',
} as const satisfies Record<MutableSellerNotificationCategory, keyof SellerNotificationPreferencesRow>

export function sellerNotificationCategory(event: SellerNotificationEvent): SellerNotificationCategory {
  return EVENT_CATEGORIES[event]
}

export function isRequiredSellerNotification(event: SellerNotificationEvent): boolean {
  return sellerNotificationCategory(event) === 'transactions'
}

export function sellerNotificationPreferenceColumn(
  category: MutableSellerNotificationCategory,
): (typeof CATEGORY_COLUMNS)[MutableSellerNotificationCategory] {
  return CATEGORY_COLUMNS[category]
}

export function sellerNotificationPreferencesFromRow(
  row: SellerNotificationPreferencesRow | null | undefined,
): SellerNotificationPreferences {
  if (!row) return { ...DEFAULT_SELLER_NOTIFICATION_PREFERENCES }
  return {
    transactions: true,
    negotiations: row.negotiations_enabled !== false,
    integrations: row.integrations_enabled !== false,
    reviews: row.reviews_enabled !== false,
    marketing: row.marketing_enabled !== false,
  }
}

export function sellerNotificationPreferencePatchToRow(
  patch: SellerNotificationPreferencePatch,
): Partial<Omit<SellerNotificationPreferencesRow, 'user_id'>> {
  return Object.fromEntries(
    MUTABLE_SELLER_NOTIFICATION_CATEGORIES.flatMap((category) =>
      typeof patch[category] === 'boolean' ? [[CATEGORY_COLUMNS[category], patch[category]]] : [],
    ),
  )
}

export type ParsedSellerNotificationPreferencePatch =
  | { ok: true; patch: SellerNotificationPreferencePatch }
  | { ok: false; error: string }

export function parseSellerNotificationPreferencePatch(
  input: unknown,
): ParsedSellerNotificationPreferencePatch {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Preferences must be an object.' }
  }

  const source = input as Record<string, unknown>
  const allowed = new Set<string>(MUTABLE_SELLER_NOTIFICATION_CATEGORIES)
  const keys = Object.keys(source)
  if (!keys.length) return { ok: false, error: 'Choose at least one notification preference.' }
  if ('transactions' in source) {
    return { ok: false, error: 'Transaction and money-state notifications are required.' }
  }

  const unknown = keys.find((key) => !allowed.has(key))
  if (unknown) return { ok: false, error: `Unsupported notification preference: ${unknown}.` }

  const patch: SellerNotificationPreferencePatch = {}
  for (const category of MUTABLE_SELLER_NOTIFICATION_CATEGORIES) {
    if (!(category in source)) continue
    if (typeof source[category] !== 'boolean') {
      return { ok: false, error: `${category} must be true or false.` }
    }
    patch[category] = source[category]
  }
  return { ok: true, patch }
}
