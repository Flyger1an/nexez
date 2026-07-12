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
 * custom domain): localhost, Vercel preview/prod domains, and configured
 * first-party Nexez hosts.
 */
export function isPlatformHost(host: string | null | undefined, siteUrl?: string | null): boolean {
  const h = normalizeHost(host)
  if (!h) return true
  if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost')) return true
  if (h.endsWith('.vercel.app')) return true

  const matchesConfigured = (configured: string | null | undefined): boolean => {
    const c = normalizeHost(extractHostFromUrl(configured))
    return !!c && (h === c || h === `www.${c}` || `www.${h}` === c)
  }

  // All first-party hosts are platform hosts, never customer custom domains. Keep
  // this env-based to avoid a circular import with lib/site.
  if (matchesConfigured(siteUrl)) return true
  if (matchesConfigured(process.env.NEXT_PUBLIC_MARKETING_URL || 'https://nexez.ai')) return true
  if (matchesConfigured(process.env.NEXT_PUBLIC_APP_URL || 'https://app.nexez.ai')) return true
  if (matchesConfigured(process.env.NEXT_PUBLIC_AGENT_RUNTIME_URL || 'https://nexez.app')) return true

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
 * Map an incoming path on a custom domain to the internal per-slug path
 * (single-page domains). Kept for back-compat / simple cases.
 * - `/` → the page itself
 * - `/agent.json`, `/mcp.json` → the page's agent artifacts (served at domain root)
 * - anything else passes through unchanged (assets, checkout, global routes)
 */
export function mapCustomDomainPath(slug: string, pathname: string): string {
  if (pathname === '/' || pathname === '') return `/${slug}`
  if (pathname === '/agent.json') return `/${slug}/agent.json`
  if (pathname === '/mcp.json') return `/${slug}/mcp.json`
  if (pathname === '/llms.txt') return `/${slug}/llms.txt`
  if (pathname === '/openapi.json') return `/${slug}/openapi.json`
  // The standard discovery probe path — answer it with the listing's live manifest.
  if (pathname === '/.well-known/agent.json') return `/${slug}/agent.json`
  if (pathname === '/.well-known/mcp.json') return `/${slug}/mcp.json`
  return pathname
}

// Agent artifacts served at a page's root on a custom domain.
export const DOMAIN_ARTIFACTS = ['agent.json', 'mcp.json', 'llms.txt', 'openapi.json'] as const
export type DomainArtifact = (typeof DOMAIN_ARTIFACTS)[number]

// Artifacts that agents probe under the conventional `/.well-known/` prefix. Only
// agent.json + mcp.json live there (llms.txt/openapi.json are served at the root).
const WELL_KNOWN_ARTIFACTS: readonly DomainArtifact[] = ['agent.json', 'mcp.json']

/**
 * Decompose an incoming custom-domain pathname into the `domain_path` it
 * targets plus an optional agent artifact. Supports root + one level of
 * subpath (e.g. `/pricing`). Returns null for paths we don't own (assets,
 * checkout, nested paths) so the request passes through unchanged.
 *
 * Examples:
 *  `/`                    → { basePath: '/',        artifact: null }
 *  `/agent.json`          → { basePath: '/',        artifact: 'agent.json' }
 *  `/pricing`             → { basePath: '/pricing', artifact: null }
 *  `/pricing/mcp.json`    → { basePath: '/pricing', artifact: 'mcp.json' }
 *  `/checkout/x`          → null
 */
export function resolveDomainPath(
  pathname: string,
): { basePath: string; artifact: DomainArtifact | null } | null {
  const clean = (pathname || '/').replace(/\/+$/, '') || '/'

  if (clean === '/') return { basePath: '/', artifact: null }

  const segments = clean.split('/').filter(Boolean)
  const isArtifact = (s: string): s is DomainArtifact =>
    (DOMAIN_ARTIFACTS as readonly string[]).includes(s)

  // `/.well-known/*` is NEVER a listing basePath. The standard discovery probes
  // (agent.json/mcp.json) map to the ROOT page's artifact; anything else under
  // /.well-known is unowned (null → passthrough). Handled early so the generic
  // `/<seg>/<artifact>` rule can't mistake `.well-known` for a sub-page.
  if (segments[0] === '.well-known') {
    return segments.length === 2 && (WELL_KNOWN_ARTIFACTS as readonly string[]).includes(segments[1]!)
      ? { basePath: '/', artifact: segments[1] as DomainArtifact }
      : null
  }
  // /<artifact> at the domain root
  if (segments.length === 1 && isArtifact(segments[0]!)) {
    return { basePath: '/', artifact: segments[0] as DomainArtifact }
  }
  // /<seg>
  if (segments.length === 1) {
    return { basePath: `/${segments[0]}`, artifact: null }
  }
  // /<seg>/<artifact>
  if (segments.length === 2 && isArtifact(segments[1]!)) {
    return { basePath: `/${segments[0]}`, artifact: segments[1] as DomainArtifact }
  }

  return null
}

/**
 * Given a domain's path→slug map and an incoming pathname, return the internal
 * rewrite target (or null to pass through). Powers multi-page custom domains.
 */
export function buildCustomDomainRewrite(
  pathToSlug: Map<string, string> | Record<string, string>,
  pathname: string,
): string | null {
  const resolved = resolveDomainPath(pathname)
  if (!resolved) return null

  const slug =
    pathToSlug instanceof Map ? pathToSlug.get(resolved.basePath) : pathToSlug[resolved.basePath]
  if (!slug) return null

  return resolved.artifact ? `/${slug}/${resolved.artifact}` : `/${slug}`
}

/** Normalize a user-entered domain path: leading slash, no trailing slash, lowercased. */
export function normalizeDomainPath(input: string | null | undefined): string {
  let p = (input || '/').trim().toLowerCase()
  if (!p.startsWith('/')) p = `/${p}`
  p = p.replace(/\/+$/, '')
  return p || '/'
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
  artifact: DomainArtifact,
  slug: string,
  onCustomHost: boolean,
  domainPath: string = '/',
): string {
  if (!onCustomHost) return `/${slug}/${artifact}`
  const base = normalizeDomainPath(domainPath)
  return base === '/' ? `/${artifact}` : `${base}/${artifact}`
}
