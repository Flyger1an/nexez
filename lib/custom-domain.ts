// Pure helpers for custom-domain agent hosting (Phase 8 / A1).
// The DB lookup + rewrite live in the edge middleware (proxy.ts); everything
// here is side-effect free so it can be unit-tested and reused.

/** Lowercase + strip port from a Host header value. */
export function normalizeHost(host: string | null | undefined): string {
  if (!host) return ''
  return host.split(':')[0]!.trim().toLowerCase()
}

function extractHostFromUrl(url: string | null | undefined): string {
  if (!url) return ''
  try {
    return new URL(url).host
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0] ?? ''
  }
}

/**
 * Hosts that belong to the Nexez platform itself (never treated as a customer's
 * custom domain): localhost, Vercel preview/prod domains, and the configured
 * site URL host.
 */
export function isPlatformHost(host: string | null | undefined, siteUrl?: string | null): boolean {
  const h = normalizeHost(host)
  if (!h) return true
  if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost')) return true
  if (h.endsWith('.vercel.app')) return true

  const site = normalizeHost(extractHostFromUrl(siteUrl))
  if (site && (h === site || h === `www.${site}` || `www.${h}` === site)) return true

  return false
}

/**
 * Candidate host strings to match against `pages.custom_domain`, covering the
 * apex/`www.` pair so a user who set either form still resolves.
 */
export function hostLookupCandidates(host: string | null | undefined): string[] {
  const h = normalizeHost(host)
  if (!h) return []
  const candidates = new Set<string>([h])
  if (h.startsWith('www.')) candidates.add(h.slice(4))
  else candidates.add(`www.${h}`)
  return [...candidates]
}

/**
 * Map an incoming path on a custom domain to the internal per-slug path.
 * - `/` → the page itself
 * - `/agent.json`, `/mcp.json` → the page's agent artifacts (served at domain root)
 * - anything else passes through unchanged (assets, checkout, global routes)
 *
 * Returns the (possibly unchanged) pathname.
 */
export function mapCustomDomainPath(slug: string, pathname: string): string {
  if (pathname === '/' || pathname === '') return `/${slug}`
  if (pathname === '/agent.json') return `/${slug}/agent.json`
  if (pathname === '/mcp.json') return `/${slug}/mcp.json`
  return pathname
}

/** True when the request arrives on a customer's custom domain (not a platform host). */
export function isCustomHost(host: string | null | undefined, siteUrl?: string | null): boolean {
  return Boolean(host) && !isPlatformHost(host, siteUrl)
}

/**
 * The base URL the page should advertise for itself (canonical, agent.json,
 * JSON-LD page url, plain-text context). When served on a verified custom
 * domain we return `https://<that domain>` so agents/search reference the brand
 * domain; otherwise the platform base URL.
 */
export function getEffectiveBaseUrl(
  host: string | null | undefined,
  platformBaseUrl: string,
  siteUrl?: string | null,
): string {
  if (isCustomHost(host, siteUrl)) {
    return `https://${normalizeHost(host)}`
  }
  return platformBaseUrl
}

/**
 * Path to a page's agent.json: served at the domain root on a custom domain,
 * or under the slug on the platform.
 */
export function agentArtifactHref(
  artifact: 'agent.json' | 'mcp.json',
  slug: string,
  onCustomHost: boolean,
): string {
  return onCustomHost ? `/${artifact}` : `/${slug}/${artifact}`
}
