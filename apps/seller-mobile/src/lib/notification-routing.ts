import { MOBILE_NOTIFICATION_PAYLOAD_TYPES } from './platform-contract-snapshot'

export type SellerRoute =
  | '/overview'
  | '/listings'
  | '/inbox'
  | '/inbox/negotiations'
  | '/inbox/orders'
  | '/inbox/reviews'
  | '/inbox/requests'
  | '/notifications'
  | '/notifications/settings'
  | '/analytics'
  | '/listing/create'
  | '/tools/billing'
  | '/tools/finance'
  | '/tools/importer'
  | '/tools/integrations'
  | '/tools/support'
  | `/listing/${string}`
  | `/inbox/negotiations/${string}`
  | `/inbox/orders/${string}`

const STATIC_ROUTES = new Set<SellerRoute>([
  '/overview',
  '/listings',
  '/inbox',
  '/inbox/negotiations',
  '/inbox/orders',
  '/inbox/reviews',
  '/inbox/requests',
  '/notifications',
  '/notifications/settings',
  '/analytics',
  '/listing/create',
  '/tools/billing',
  '/tools/finance',
  '/tools/importer',
  '/tools/integrations',
  '/tools/support',
])

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const NEXEZ_WEB_HOSTS = new Set(['app.nexez.ai'])
const NOTIFICATION_PAYLOAD_TYPES = new Set<string>(MOBILE_NOTIFICATION_PAYLOAD_TYPES)

function cleanIdentifier(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return SAFE_ID.test(trimmed) ? trimmed : null
}

function dynamicRoute(path: string): SellerRoute | null {
  const listing = path.match(/^\/listing\/([^/]+)(?:\/(?:edit|offers|readiness|simulator|competitor|trust|autorules))?$/)
  if (listing && cleanIdentifier(listing[1])) return path as SellerRoute

  const negotiation = path.match(/^\/inbox\/negotiations\/([^/]+)$/)
  if (negotiation && cleanIdentifier(negotiation[1])) return path as SellerRoute

  const order = path.match(/^\/inbox\/orders\/([^/]+)$/)
  if (order && cleanIdentifier(order[1])) return path as SellerRoute

  return null
}

function normalizePath(path: string): SellerRoute | null {
  const withoutQuery = path.split(/[?#]/, 1)[0] || '/'
  const normalized = withoutQuery.length > 1 ? withoutQuery.replace(/\/+$/, '') : withoutQuery
  if (STATIC_ROUTES.has(normalized as SellerRoute)) return normalized as SellerRoute
  return dynamicRoute(normalized)
}

function webDashboardRoute(path: string): SellerRoute | null {
  if (path === '/dashboard' || path === '/dashboard/') return '/overview'
  if (path === '/dashboard/finance' || path === '/dashboard/finance/') return '/tools/finance'
  if (path === '/dashboard/negotiations' || path === '/dashboard/negotiations/') return '/inbox/negotiations'

  const negotiation = path.match(/^\/dashboard\/negotiations\/([^/]+)\/?$/)
  const id = cleanIdentifier(negotiation?.[1])
  return id ? `/inbox/negotiations/${id}` : null
}

/**
 * Convert only known Nexie routes into an in-app destination. Unknown schemes,
 * hosts, paths, traversal attempts, and unsafe identifiers fail closed.
 */
export function normalizeSellerDeepLink(input: unknown): SellerRoute | null {
  if (typeof input !== 'string') return null
  const value = input.trim()
  if (!value) return null

  if (value.startsWith('/')) return normalizePath(value)

  try {
    const url = new URL(value)
    if (url.protocol === 'nexez-seller:') {
      const host = url.hostname ? `/${url.hostname}` : ''
      return normalizePath(`${host}${url.pathname}${url.search}${url.hash}`)
    }
    if (url.protocol === 'https:' && NEXEZ_WEB_HOSTS.has(url.hostname.toLowerCase())) {
      return normalizePath(url.pathname) ?? webDashboardRoute(url.pathname)
    }
  } catch {
    return null
  }

  return null
}

function firstIdentifier(data: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = cleanIdentifier(data[key])
    if (value) return value
  }
  return null
}

/** Resolve a seller push payload to the most specific safe screen available. */
export function sellerNotificationDestination(data: unknown): SellerRoute {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return '/notifications'
  const payload = data as Record<string, unknown>
  const explicitRoute = normalizeSellerDeepLink(payload.url)
  if (explicitRoute) return explicitRoute

  const type = typeof payload.type === 'string' ? payload.type.trim().toLowerCase() : ''
  if (!NOTIFICATION_PAYLOAD_TYPES.has(type)) return '/notifications'
  if (type === 'negotiation') {
    const id = firstIdentifier(payload, ['negotiationId', 'negotiation_id', 'id'])
    return id ? `/inbox/negotiations/${id}` : '/inbox/negotiations'
  }
  if (type === 'order') {
    const id = firstIdentifier(payload, ['orderId', 'order_id', 'id'])
    return id ? `/inbox/orders/${id}` : '/inbox/orders'
  }
  if (type === 'listing' || type === 'page') {
    const id = firstIdentifier(payload, ['pageId', 'page_id', 'listingId', 'listing_id', 'id'])
    return id ? `/listing/${id}` : '/listings'
  }
  if (type === 'review') return '/inbox/reviews'
  if (['request', 'buyer_request', 'refund_request', 'problem_report'].includes(type)) return '/inbox/requests'
  if (['finance', 'refund', 'dispute', 'payout'].includes(type)) return '/tools/finance'

  return '/notifications'
}
