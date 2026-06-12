// Host/canonical helpers for the nexez.ai (marketing) ↔ nexez.app (brain) split.
//
// One Next.js app serves both domains; the proxy middleware canonicalizes each
// route to its host. The "brain" (agent pages + artifacts, negotiation, checkout,
// API, auth) lives on nexez.app — its base URL is unchanged (getBaseUrl()). The
// marketing/discovery/education surfaces live on nexez.ai. Pure + side-effect free
// so it's unit-testable and safe to import from the edge middleware.

function hostOf(url: string | undefined | null, fallback: string): string {
  if (!url) return fallback
  try {
    return new URL(url).host.toLowerCase()
  } catch {
    return (url.replace(/^https?:\/\//, '').split('/')[0] || fallback).toLowerCase()
  }
}

/** The product/brain host (agent-facing). Unchanged from NEXT_PUBLIC_SITE_URL. */
export const APP_HOST = hostOf(process.env.NEXT_PUBLIC_SITE_URL, 'nexez.app')
/** The marketing host. Defaults to nexez.ai so the split works even without the env. */
export const MARKETING_HOST = hostOf(process.env.NEXT_PUBLIC_MARKETING_URL, 'nexez.ai')

// Routes that belong on the marketing host (nexez.ai): the exact homepage plus a
// set of prefixes. Everything else (agent [slug] pages, dashboard, negotiate,
// checkout, api, auth, onboard, create, .well-known, artifacts) is the brain → nexez.app.
const MARKETING_PREFIXES = [
  '/pricing',
  '/privacy',
  '/terms',
  '/design',
  '/directory',
  '/leaderboard',
  '/marketplace',
  '/simulator',
  '/support',
  '/blog', // future content
  '/docs', // future docs
] as const

// Paths that must be served on BOTH hosts (each domain has its own copy) and
// therefore must NOT be canonical-redirected — otherwise e.g. the marketing
// sitemap/robots on nexez.ai would bounce to nexez.app.
const HOST_NEUTRAL = new Set(['/sitemap.xml', '/robots.txt'])

/** True when a path is served per-host and must skip canonical-host redirects. */
export function isHostNeutralPath(pathname: string): boolean {
  return HOST_NEUTRAL.has(pathname.replace(/\/+$/, '') || '/')
}

/** True when `pathname` should be served on the marketing host (nexez.ai). */
export function isMarketingPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/'
  if (p === '/') return true
  // Match a prefix exactly or as a path segment (so `/design` matches but `/designs` does not).
  return MARKETING_PREFIXES.some((pre) => p === pre || p.startsWith(`${pre}/`))
}

/** The host a given path is canonical to. */
export function canonicalHostFor(pathname: string): string {
  return isMarketingPath(pathname) ? MARKETING_HOST : APP_HOST
}

function urlFor(host: string, path: string): string {
  const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
  return `${proto}://${host}${path.startsWith('/') ? path : `/${path}`}`
}

/** Absolute URL on the brain host (nexez.app) — for marketing→app cross-links. */
export function appUrl(path = '/'): string {
  return urlFor(APP_HOST, path)
}

/** Absolute URL on the marketing host (nexez.ai) — for app→marketing cross-links. */
export function marketingUrl(path = '/'): string {
  return urlFor(MARKETING_HOST, path)
}
