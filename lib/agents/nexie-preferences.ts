// Buyer "standing preferences" for the Nexxi agent - budget, interests, timing, and
// location that persist on the user_agents.preferences JSONB and steer every turn (and
// a voice-replies default the mobile app reads). Pure + validated so the route, the
// agent prompt, and tests all share one shape. No secrets, no DB access here.

export type NexieTiming = 'flexible' | 'this_week' | 'asap'

/** Buyer-facing push categories the buyer can independently mute (master switch = notificationsEnabled). */
export type NexieNotificationCategory = 'orders' | 'alerts' | 'tasks'
export type NexieNotificationTypes = Record<NexieNotificationCategory, boolean>
export const NEXIE_NOTIFICATION_CATEGORIES: NexieNotificationCategory[] = ['orders', 'alerts', 'tasks']

export type NexiePreferences = {
  /** Soft budget ceiling in MAJOR currency units (e.g. dollars), or null for none. */
  budgetMax: number | null
  /** ISO-4217-ish 3-letter code, upper-cased. Pairs with budgetMax. */
  currency: string
  /** Service/product interests, e.g. ['cleaning', 'web design']. */
  categories: string[]
  timing: NexieTiming | null
  location: string | null
  /** When true, the app defaults spoken replies on. */
  voiceRepliesDefault: boolean
  /** Push opt-in master switch (default true; false = the server skips ALL sends to this buyer). */
  notificationsEnabled: boolean
  /** Per-category push opt-in (each default true). Ignored when notificationsEnabled is false. */
  notificationTypes: NexieNotificationTypes
  /**
   * Which search sources to include, by adapter id. `null` = all available sources (the default);
   * `[]` = Nexez only. The Nexez marketplace is always searched regardless (core/transactable);
   * this list governs the optional external discovery sources (e.g. 'yelp', 'google_places').
   */
  sources: string[] | null
}

export const NEXIE_TIMINGS: NexieTiming[] = ['flexible', 'this_week', 'asap']

const MAX_CATEGORIES = 12
const MAX_CATEGORY_LEN = 40
const MAX_LOCATION_LEN = 80
const MAX_BUDGET = 100_000_000 // sanity ceiling on the soft hint

export const DEFAULT_PREFERENCES: NexiePreferences = {
  budgetMax: null,
  currency: 'USD',
  categories: [],
  timing: null,
  location: null,
  voiceRepliesDefault: false,
  notificationsEnabled: true,
  notificationTypes: { orders: true, alerts: true, tasks: true },
  sources: null,
}

const MAX_SOURCES = 12
const MAX_SOURCE_ID_LEN = 32

/** Coerce arbitrary stored/posted JSON into a complete, safe NexiePreferences. */
export function normalizePreferences(input: unknown): NexiePreferences {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}

  let budgetMax: number | null = null
  if (typeof o.budgetMax === 'number' && Number.isFinite(o.budgetMax) && o.budgetMax > 0) {
    budgetMax = Math.min(Math.round(o.budgetMax), MAX_BUDGET)
  }

  const currency =
    typeof o.currency === 'string' && /^[a-z]{3}$/i.test(o.currency.trim())
      ? o.currency.trim().toUpperCase()
      : 'USD'

  const categories: string[] = []
  const seen = new Set<string>()
  if (Array.isArray(o.categories)) {
    for (const raw of o.categories) {
      if (typeof raw !== 'string') continue
      const value = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_CATEGORY_LEN)
      const key = value.toLowerCase()
      if (!value || seen.has(key)) continue
      seen.add(key)
      categories.push(value)
      if (categories.length >= MAX_CATEGORIES) break
    }
  }

  const timing = NEXIE_TIMINGS.includes(o.timing as NexieTiming) ? (o.timing as NexieTiming) : null

  // Per-category push opt-in: each defaults ON unless explicitly false.
  const nt = o.notificationTypes && typeof o.notificationTypes === 'object' ? (o.notificationTypes as Record<string, unknown>) : {}
  const notificationTypes: NexieNotificationTypes = {
    orders: nt.orders !== false,
    alerts: nt.alerts !== false,
    tasks: nt.tasks !== false,
  }

  const location =
    typeof o.location === 'string' && o.location.trim()
      ? o.location.trim().replace(/\s+/g, ' ').slice(0, MAX_LOCATION_LEN)
      : null

  // null/absent → all sources (default). An array (even empty) is an explicit selection.
  let sources: string[] | null = null
  if (Array.isArray(o.sources)) {
    const ids: string[] = []
    const seenIds = new Set<string>()
    for (const raw of o.sources) {
      if (typeof raw !== 'string') continue
      const id = raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, MAX_SOURCE_ID_LEN)
      if (!id || seenIds.has(id)) continue
      seenIds.add(id)
      ids.push(id)
      if (ids.length >= MAX_SOURCES) break
    }
    sources = ids
  }

  return {
    budgetMax,
    currency,
    categories,
    timing,
    location,
    voiceRepliesDefault: o.voiceRepliesDefault === true,
    notificationsEnabled: o.notificationsEnabled !== false,
    notificationTypes,
    sources,
  }
}

const TIMING_LABEL: Record<NexieTiming, string> = {
  flexible: 'flexible / no rush',
  this_week: 'within this week',
  asap: 'as soon as possible',
}

/**
 * A compact, model-readable block of the buyer's standing preferences for the system
 * prompt - or '' when nothing agent-relevant is set (voiceRepliesDefault is UI-only).
 */
export function preferencesPromptBlock(prefs: NexiePreferences): string {
  const lines: string[] = []
  if (prefs.budgetMax != null) {
    lines.push(`- Budget ceiling: up to ${prefs.budgetMax} ${prefs.currency} (soft guidance; confirm before exceeding).`)
  }
  if (prefs.categories.length) lines.push(`- Interested in: ${prefs.categories.join(', ')}.`)
  if (prefs.timing) lines.push(`- Timing: ${TIMING_LABEL[prefs.timing]}.`)
  if (prefs.location) lines.push(`- Location: ${prefs.location}.`)
  if (!lines.length) return ''
  return `Buyer standing preferences (honor these unless the buyer overrides them this turn):\n${lines.join('\n')}`
}
