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

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL

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

    const { data } = await supabase
      .from('pages')
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

export async function proxy(request: NextRequest) {
  const host = request.headers.get('host') || ''

  // A custom (non-platform) host that maps to a verified, published page gets
  // rewritten to that page so the brand domain serves the agent-optimized page.
  if (!isPlatformHost(host, SITE_URL)) {
    const pathToSlug = await resolvePathMapForHost(host)
    if (Object.keys(pathToSlug).length) {
      const mapped = buildCustomDomainRewrite(pathToSlug, request.nextUrl.pathname)
      if (mapped && mapped !== request.nextUrl.pathname) {
        const url = request.nextUrl.clone()
        url.pathname = mapped
        return NextResponse.rewrite(url)
      }
    }
    // Unknown/unverified custom domain → fall through to normal handling.
  }

  return updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
