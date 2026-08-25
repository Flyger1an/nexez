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
  if (matchesConfigured(process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.nexez.ai')) return true
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
  // The live JSON-RPC MCP server, not a static artifact.
  if (pathname === '/mcp') return `/${slug}/mcp`
  // The standard discovery probe path - answer it with the listing's live manifest.
  if (pathname === '/.well-known/agent.json') return `/${slug}/agent.json`
  if (pathname === '/.well-known/mcp.json') return `/${slug}/mcp.json`
  // ARD catalog: only ever under /.well-known/, never at the domain root.
  if (pathname === '/.well-known/ai-catalog.json') return `/${slug}/ai-catalog.json`
  return pathname
}

// Agent artifacts served at a page's root on a custom domain.
export const DOMAIN_ARTIFACTS = ['agent.json', 'mcp.json', 'llms.txt', 'openapi.json'] as const
export type DomainArtifact = (typeof DOMAIN_ARTIFACTS)[number]

// Artifacts that agents probe under the conventional `/.well-known/` prefix. Only
// agent.json + mcp.json live there (llms.txt/openapi.json are served at the root).
const WELL_KNOWN_ARTIFACTS: readonly DomainArtifact[] = ['agent.json', 'mcp.json']

/**
 * Artifacts that exist ONLY under `/.well-known/` and describe the whole HOST
 * rather than one listing.
 *
 * ARD fixes ai-catalog.json at `/.well-known/`, and a catalog enumerates every
 * resource on the domain, so it is deliberately NOT a DomainArtifact: there is
 * no `/ai-catalog.json` at the root and no `/pricing/ai-catalog.json` per
 * sub-page. On a multi-listing domain the single catalog covers them all, which
 * is why the rewrite below resolves against the domain rather than a basePath.
 */
export const WELL_KNOWN_ONLY_ARTIFACTS = ['ai-catalog.json'] as const
export type WellKnownOnlyArtifact = (typeof WELL_KNOWN_ONLY_ARTIFACTS)[number]

/**
 * LIVE endpoints served under a listing on a custom domain. These are servers,
 * not files, so they are matched separately from DOMAIN_ARTIFACTS and stay out
 * of the artifact href helpers (which are about static documents).
 *
 * `/mcp` is the JSON-RPC MCP server. Without this the manifest could only
 * advertise a path that 308s to the platform, which works solely because agents
 * follow redirects and costs an extra cross-origin hop on every call.
 */
export const DOMAIN_LIVE_ENDPOINTS = ['mcp'] as const
export type DomainLiveEndpoint = (typeof DOMAIN_LIVE_ENDPOINTS)[number]

const WELL_KNOWN_PREFIX = '/.well-known/'

// A backslash or a control character anywhere in a decoded pathname. Neither can
// appear in a path we serve: slugs are constrained at the DB level and every
// artifact name is a fixed literal.
// eslint-disable-next-line no-control-regex
const MALFORMED_PATH_CHARS = /[\\\u0000-\u001f\u007f]/

/**
 * True for a request path that cannot possibly address anything we serve, so it
 * must be rejected before the router sees it.
 *
 * The motivating case is a trailing encoded backslash, `/agent.json%5C`. It
 * survives routing as a literal filename and the Next.js launcher throws
 * MODULE_NOT_FOUND trying to require `pages/agent.json%5C.js`, which surfaces as
 * a runtime error group rather than the 404 it should be. Seven such groups were
 * live in production across `/agent.json`, `/agent-pages.json`, and
 * `/.well-known/nexez.json`: exactly the discovery paths an external scanner
 * probes, and nothing in this repo emits them.
 *
 * Percent-decoding is the point. The raw pathname holds `%5C`, which is
 * harmless-looking; only the decoded form shows the backslash. A sequence that
 * cannot be decoded at all (`%ZZ`) is malformed by the same standard.
 */
export function isMalformedRequestPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  if (MALFORMED_PATH_CHARS.test(pathname)) return true
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return true
  }
  return MALFORMED_PATH_CHARS.test(decoded)
}

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
  // Defence in depth: proxy() already 404s these before routing, but a malformed
  // path must never be turned into a rewrite target by any caller.
  if (isMalformedRequestPath(pathname)) return null
  const clean = (pathname || '/').replace(/\/+$/, '') || '/'

  if (clean === '/') return { basePath: '/', artifact: null }

  const segments = clean.split('/').filter(Boolean)
  const isArtifact = (s: string): s is DomainArtifact =>
    (DOMAIN_ARTIFACTS as readonly string[]).includes(s)

  // `/.well-known/*` is NEVER a listing basePath. The standard discovery probes
  // (agent.json/mcp.json) map to the ROOT page's artifact; anything else under
  // /.well-known is unowned (null → passthrough). Handled early so the generic
  // `/<seg>/<artifact>` rule can't mistake `.well-known` for a sub-page.
  // Domain-scoped artifacts (ai-catalog.json) are resolved by
  // buildCustomDomainRewrite BEFORE this function is consulted.
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
 * Entry-point slug for a domain-scoped artifact. Prefers the root listing; falls
 * back to the first path alphabetically so a domain that only hosts sub-pages
 * (no `/` listing) still serves its catalog instead of 308-ing to the platform.
 * The route re-resolves the full listing set from the Host header, so any
 * listing on the domain is a valid entry point.
 */
function domainScopedEntrySlug(map: Record<string, string>): string | null {
  if (map['/']) return map['/']
  const paths = Object.keys(map).sort()
  return paths.length ? (map[paths[0]!] ?? null) : null
}

/** `/mcp` at the domain root, or `/<domain_path>/mcp` for a sub-page listing. */
function resolveLiveEndpoint(clean: string): { basePath: string; endpoint: DomainLiveEndpoint } | null {
  const segments = clean.split('/').filter(Boolean)
  if (!segments.length || segments[0] === '.well-known') return null

  const last = segments[segments.length - 1]!
  if (!(DOMAIN_LIVE_ENDPOINTS as readonly string[]).includes(last)) return null

  if (segments.length === 1) return { basePath: '/', endpoint: last as DomainLiveEndpoint }
  if (segments.length === 2) return { basePath: `/${segments[0]}`, endpoint: last as DomainLiveEndpoint }
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
  if (isMalformedRequestPath(pathname)) return null
  const map = pathToSlug instanceof Map ? Object.fromEntries(pathToSlug) : pathToSlug
  const clean = (pathname || '/').replace(/\/+$/, '') || '/'

  // Domain-scoped well-known artifacts first: they belong to the host, so they
  // resolve against the domain's listing set rather than a single basePath.
  if (clean.startsWith(WELL_KNOWN_PREFIX)) {
    const name = clean.slice(WELL_KNOWN_PREFIX.length)
    if ((WELL_KNOWN_ONLY_ARTIFACTS as readonly string[]).includes(name)) {
      const slug = domainScopedEntrySlug(map)
      return slug ? `/${slug}/${name}` : null
    }
  }

  // Live endpoints, but ONLY when the path is not itself a registered
  // domain_path: a merchant who chose the literal domain_path `/mcp` keeps their
  // page, and their listing's server stays reachable at `/mcp/mcp`.
  if (!(clean in map)) {
    const live = resolveLiveEndpoint(clean)
    if (live) {
      const liveSlug = map[live.basePath]
      return liveSlug ? `/${liveSlug}/${live.endpoint}` : null
    }
  }

  const resolved = resolveDomainPath(pathname)
  if (!resolved) return null

  const slug = map[resolved.basePath]
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

export function validateDomainPath(input: string | null | undefined): { ok: true; value: string } | { ok: false; value: string; message: string } {
  const value = normalizeDomainPath(input)
  if (value === '/') return { ok: true, value }
  if (value.length < 6) {
    return { ok: false, value, message: 'Use at least 5 characters after the slash.' }
  }
  if (value.length > 64) {
    return { ok: false, value, message: 'Use no more than 63 characters after the slash.' }
  }
  if (!/^\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    return {
      ok: false,
      value,
      message: 'Use one path segment with lowercase letters, numbers, and single hyphens.',
    }
  }
  return { ok: true, value }
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
