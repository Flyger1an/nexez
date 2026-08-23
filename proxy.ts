import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { updateSession } from './utils/supabase/middleware'
import {
  buildCustomDomainRewrite,
  hostLookupCandidates,
  isMalformedRequestPath,
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

/** Best identifier we can print for a failed lookup: PostgREST code, fetch cause, or message. */
function describeLookupError(err: unknown): string {
  if (!err) return 'unknown'
  const e = err as { code?: string; message?: string; cause?: { code?: string } }
  return e.code || e.cause?.code || e.message || 'unknown'
}

// Resolve a host to its { domain_path -> slug } map (all verified, published,
// currently-serving pages on that domain). Supports multiple pages per domain (C9).
//
// This lookup is deliberately AUTHORITATIVE on every custom-host request. A cached
// positive mapping is an authorization revocation bypass: after a downgrade, DNS
// proof removal, domain reallocation, or storefront suspension, the old host would
// keep serving until its TTL expired (and formerly indefinitely during lookup
// failures). `pages_public` materializes those decisions, so routing must read its
// current state and fail closed when that state cannot be checked.
async function resolvePathMapForHost(host: string): Promise<Record<string, string>> {
  const key = normalizeHost(host)
  if (!key) return {}

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { cookies: { getAll: () => [], setAll: () => {} } },
    )

    // Read the redacted public view, NOT base `pages`: anon SELECT on `pages` is
    // revoked (owner-private rules redaction), so querying `pages` here silently
    // fails (permission denied) and breaks custom-domain routing. `pages_public`
    // exposes the slug/domain_path/custom_domain(+verified)/is_published/serving
    // fields this authoritative routing decision needs.
    const { data, error } = await supabase
      .from('pages_public')
      .select('slug, domain_path')
      .in('custom_domain', hostLookupCandidates(host))
      .eq('is_published', true)
      .eq('serving', true)
      .not('custom_domain_verified', 'is', null)
      .returns<Array<{ slug: string; domain_path: string | null }>>()

    // PostgREST reports failures in the payload rather than throwing, so an
    // errored response would otherwise look identical to "this host has no pages".
    if (error) throw error

    const pathToSlug: Record<string, string> = {}
    for (const row of data ?? []) {
      pathToSlug[normalizeDomainPath(row.domain_path)] = row.slug
    }

    return pathToSlug
  } catch (err) {
    // Warn, never throw: a hard failure here would take the proxy down for
    // platform hosts too. For a custom host, an unverifiable routing grant must
    // fail closed to the canonical-host redirect below, never to stale content.
    console.warn('[proxy] custom-domain lookup failed for', key, describeLookupError(err))
    return {}
  }
}

// Cheap "is this browser signed in?" check for the proxy: the Supabase session
// lives in `sb-<ref>-auth-token` cookie(s). Presence is a heuristic only — the
// dashboard's auth gate still validates — so it's fine to act on without a round-trip.
function hasPlatformSession(request: NextRequest): boolean {
  return hasSupabaseAuthCookie(request.cookies.getAll())
}

export async function proxy(request: NextRequest) {
  // Reject malformed paths before anything else looks at them. `/agent.json%5C`
  // and friends otherwise reach the Next.js launcher, which throws
  // MODULE_NOT_FOUND trying to require `pages/agent.json%5C.js` and turns a
  // scanner probe into a production error group. A 404 is the honest answer and
  // costs nothing: no DB read, no rewrite, no redirect to a canonical host.
  if (isMalformedRequestPath(request.nextUrl.pathname)) {
    return new NextResponse(null, { status: 404 })
  }

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
    // Unknown/unmapped custom-domain path → leave the arbitrary host and serve
    // the route from its canonical Nexez host instead of reflecting platform
    // content under a random Host header.
    const url = request.nextUrl.clone()
    url.host = canonicalHostFor(request.nextUrl.pathname)
    url.protocol = 'https'
    url.port = ''
    return persistAbBucket(NextResponse.redirect(url, 308), abBucket)
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
