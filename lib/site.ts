// Host/canonical helpers for the nexez.ai marketing/app split and the nexez.app
// public agent runtime.
//
// One Next.js app serves both domains; the proxy middleware canonicalizes each
// route to its host. Marketing/discovery lives on nexez.ai, the authenticated
// product lives on app.nexez.ai, and public agent pages/artifacts live on
// nexez.app. Pure + side-effect free so it is unit-testable and safe to import
// from the edge middleware.

function hostOf(url: string | undefined | null, fallback: string): string {
  if (!url) return fallback
  try {
    return new URL(url).host.toLowerCase()
  } catch {
    return (url.replace(/^https?:\/\//, '').split('/')[0] || fallback).toLowerCase()
  }
}

/** The marketing host. Defaults to nexez.ai so the split works even without the env. */
export const MARKETING_HOST = hostOf(process.env.NEXT_PUBLIC_MARKETING_URL, 'nexez.ai')
/** The authenticated app host. */
export const APP_HOST = hostOf(process.env.NEXT_PUBLIC_APP_URL, 'app.nexez.ai')
/** The public, crawlable agent-page runtime host. */
export const AGENT_RUNTIME_HOST = hostOf(
  process.env.NEXT_PUBLIC_AGENT_RUNTIME_URL ?? process.env.NEXT_PUBLIC_SITE_URL,
  'nexez.app',
)

// Routes that belong on the marketing host (nexez.ai): the exact homepage plus a
// set of discovery/education prefixes.
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

const APP_PREFIXES = ['/dashboard', '/create', '/login', '/auth', '/onboard'] as const

const MARKETING_API_PREFIXES = [
  '/api/directory',
  '/api/public-simulate',
  '/api/simulate-llm',
  '/api/support',
] as const

const APP_API_PREFIXES = [
  '/api/account',
  '/api/ai',
  '/api/analytics',
  '/api/analyze-competitor',
  '/api/auth',
  '/api/billing',
  '/api/crawlability',
  '/api/custom-domain',
  '/api/dashboard',
  '/api/integrations',
  '/api/onboarding',
  '/api/pages',
  '/api/payment-method',
  '/api/readiness',
  '/api/settings',
  '/api/subscription',
  '/api/test-outbound',
  '/api/tools',
  '/api/trust-report',
  '/api/usage',
  '/api/verify-custom-domain',
] as const

const AGENT_RUNTIME_PREFIXES = ['/checkout', '/negotiate', '/.well-known'] as const

const AGENT_RUNTIME_API_PREFIXES = [
  '/api/agent-search',
  '/api/checkout',
  '/api/cron',
  '/api/negotiations',
  '/api/v1',
  '/api/webhooks',
] as const

const AGENT_RUNTIME_EXACT = new Set(['/agent-pages.json', '/llms.txt', '/openapi.json', '/widget.js'])

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

/** True when `pathname` should be served on the authenticated app host. */
export function isAppPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/'
  return APP_PREFIXES.some((pre) => p === pre || p.startsWith(`${pre}/`))
}

/** True when `pathname` should be served on the public agent runtime host. */
export function isAgentRuntimePath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/'
  if (AGENT_RUNTIME_EXACT.has(p)) return true
  return AGENT_RUNTIME_PREFIXES.some((pre) => p === pre || p.startsWith(`${pre}/`))
}

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  const p = pathname.replace(/\/+$/, '') || '/'
  return prefixes.some((pre) => p === pre || p.startsWith(`${pre}/`))
}

/** The host a given path is canonical to. */
export function canonicalHostFor(pathname: string): string {
  if (isMarketingPath(pathname) || matchesPrefix(pathname, MARKETING_API_PREFIXES)) {
    return MARKETING_HOST
  }
  if (isAppPath(pathname) || matchesPrefix(pathname, APP_API_PREFIXES)) {
    return APP_HOST
  }
  if (isAgentRuntimePath(pathname) || matchesPrefix(pathname, AGENT_RUNTIME_API_PREFIXES)) {
    return AGENT_RUNTIME_HOST
  }
  return AGENT_RUNTIME_HOST
}

function urlFor(host: string, path: string): string {
  const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
  return `${proto}://${host}${path.startsWith('/') ? path : `/${path}`}`
}

/** Absolute URL on the authenticated product host. */
export function appUrl(path = '/'): string {
  return urlFor(APP_HOST, path)
}

/** Absolute URL on the marketing host. */
export function marketingUrl(path = '/'): string {
  return urlFor(MARKETING_HOST, path)
}

/** Absolute URL on the public agent runtime host. */
export function agentRuntimeUrl(path = '/'): string {
  return urlFor(AGENT_RUNTIME_HOST, path)
}
