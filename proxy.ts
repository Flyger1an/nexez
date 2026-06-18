import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { updateSession } from './utils/supabase/middleware'
import {
  buildCustomDomainRewrite,
  hostLookupCandidates,
  isPlatformHost,
  normalizeDomainPath,
  normalizeHost,
} from './lib/custom-domain'
import { AB_BUCKET_COOKIE, randomBucket } from './lib/ab-testing'
import { hasSupabaseAuthCookie } from './lib/auth-cookie'
import {
  AGENT_RUNTIME_HOST,
  APP_HOST,
  MARKETING_HOST,
  canonicalHostFor,
  isDualPath,
  isHostNeutralPath,
} from './lib/site'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL
const AB_BUCKET_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

// Sticky A/B bucket: assigned once per browser so every visitor consistently
// sees the same variant of any A/B test (and their later checkout attributes to
// it). Set on the *request* too so this same render reads it (RSCs can't set
// cookies). Returns the bucket value to persist on the response, or null if the
// visitor already has one.
function ensureAbBucket(request: NextRequest): string | null {
  if (request.cookies.get(AB_BUCKET_COOKIE)) return null
  const value = String(randomBucket())
  request.cookies.set(AB_BUCKET_COOKIE, value)
  return value
}

function persistAbBucket(response: NextResponse, value: string | null): NextResponse {
  if (value !== null) {
    response.cookies.set(AB_BUCKET_COOKIE, value, {
      maxAge: AB_BUCKET_MAX_AGE,
      sameSite: 'lax',
      httpOnly: true,
      // Secure in prod (always HTTPS on Vercel); left off in local http dev so the
      // cookie is still set. The value is a non-sensitive sticky-bucket integer.
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    })
  }
  return response
}

// Small per-instance cache so we don't hit Supabase on every custom-domain
// request. Edge instances are ephemeral, but this still collapses bursts.
const domainCache = new Map<string, { pathToSlug: Record<string, string>; expires: number }>()
const CACHE_TTL_MS = 60_000

// Resolve a host to its { domain_path -> slug } map (all verified, published
// pages on that domain). Supports multiple pages per domain (C9).
async function resolvePathMapForHost(host: string): Promise<Record<string, string>> {
  const key = normalizeHost(host)
  if (!key) return {}

  const cached = domainCache.get(key)
  if (cached && cached.expires > Date.now()) return cached.pathToSlug

  const pathToSlug: Record<string, string> = {}
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { cookies: { getAll: () => [], setAll: () => {} } },
    )

    // Read the redacted public view, NOT base `pages`: anon SELECT on `pages` is
    // revoked (owner-private rules redaction), so querying `pages` here silently
    // fails (permission denied) and breaks custom-domain routing. `pages_public`
    // exposes the slug/domain_path/custom_domain(+verified)/is_published this needs.
    const { data } = await supabase
      .from('pages_public')
      .select('slug, domain_path')
      .in('custom_domain', hostLookupCandidates(host))
      .eq('is_published', true)
      .not('custom_domain_verified', 'is', null)
      .returns<Array<{ slug: string; domain_path: string | null }>>()

    for (const row of data ?? []) {
      pathToSlug[normalizeDomainPath(row.domain_path)] = row.slug
    }
  } catch {
    // leave empty on failure
  }

  domainCache.set(key, { pathToSlug, expires: Date.now() + CACHE_TTL_MS })
  return pathToSlug
}

// Cheap "is this browser signed in?" check for the proxy: the Supabase session
// lives in `sb-<ref>-auth-token` cookie(s). Presence is a heuristic only — the
// dashboard's auth gate still validates — so it's fine to act on without a round-trip.
function hasPlatformSession(request: NextRequest): boolean {
  return hasSupabaseAuthCookie(request.cookies.getAll())
}

export async function proxy(request: NextRequest) {
  const host = request.headers.get('host') || ''
  const abBucket = ensureAbBucket(request)

  // A custom (non-platform) host that maps to a verified, published page gets
  // rewritten to that page so the brand domain serves the agent-optimized page.
  if (!isPlatformHost(host, SITE_URL)) {
    const pathToSlug = await resolvePathMapForHost(host)
    if (Object.keys(pathToSlug).length) {
      const mapped = buildCustomDomainRewrite(pathToSlug, request.nextUrl.pathname)
      if (mapped && mapped !== request.nextUrl.pathname) {
        const url = request.nextUrl.clone()
        url.pathname = mapped
        return persistAbBucket(NextResponse.rewrite(url), abBucket)
      }
    }
    // Unknown/unverified custom domain → fall through to normal handling.
  }

  // Canonical-host split: marketing routes live on nexez.ai, the app lives on
  // app.nexez.ai, and public agent pages/artifacts live on nexez.app. Enforce
  // only on real first-party prod hosts so previews and localhost keep serving
  // every route for dev/preview. 308 = permanent + method-preserving.
  const currentHost = normalizeHost(host)
  const matchesFirstPartyHost = (firstPartyHost: string) =>
    currentHost === firstPartyHost || currentHost === `www.${firstPartyHost}`
  const isFirstPartyHost =
    matchesFirstPartyHost(APP_HOST) ||
    matchesFirstPartyHost(MARKETING_HOST) ||
    matchesFirstPartyHost(AGENT_RUNTIME_HOST)
  if (isFirstPartyHost && !isHostNeutralPath(request.nextUrl.pathname)) {
    // A signed-in user who lands on the app host's root gets their dashboard.
    // The dashboard auth gate still validates, so stale cookies fall through to
    // /login. 307 because this depends on auth state.
    if (matchesFirstPartyHost(APP_HOST) && request.nextUrl.pathname === '/' && hasPlatformSession(request)) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      url.search = ''
      return persistAbBucket(NextResponse.redirect(url, 307), abBucket)
    }

    const isOwnerPreview = request.nextUrl.searchParams.get('preview') === '1'
    let wantHost = isOwnerPreview ? APP_HOST : canonicalHostFor(request.nextUrl.pathname)
    // Dual discovery surfaces (directory/leaderboard/marketplace/simulator/support)
    // are canonical to the marketing host for anonymous visitors, but a signed-in
    // visitor gets the in-app experience on the app host — so they keep the
    // dashboard nav instead of bouncing to the marketing chrome.
    if (isDualPath(request.nextUrl.pathname) && hasPlatformSession(request)) {
      wantHost = APP_HOST
    }
    if (currentHost !== wantHost) {
      const url = request.nextUrl.clone()
      url.host = wantHost
      url.protocol = 'https'
      url.port = ''
      return persistAbBucket(NextResponse.redirect(url, 308), abBucket)
    }
  }

  return persistAbBucket(await updateSession(request), abBucket)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
