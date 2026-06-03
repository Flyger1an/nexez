import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { updateSession } from './utils/supabase/middleware'
import {
  hostLookupCandidates,
  isPlatformHost,
  mapCustomDomainPath,
  normalizeHost,
} from './lib/custom-domain'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL

// Small per-instance cache so we don't hit Supabase on every custom-domain
// request. Edge instances are ephemeral, but this still collapses bursts.
const domainCache = new Map<string, { slug: string | null; expires: number }>()
const CACHE_TTL_MS = 60_000

async function resolveSlugForHost(host: string): Promise<string | null> {
  const key = normalizeHost(host)
  if (!key) return null

  const cached = domainCache.get(key)
  if (cached && cached.expires > Date.now()) return cached.slug

  let slug: string | null = null
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { cookies: { getAll: () => [], setAll: () => {} } },
    )

    const { data } = await supabase
      .from('pages')
      .select('slug')
      .in('custom_domain', hostLookupCandidates(host))
      .eq('is_published', true)
      .not('custom_domain_verified', 'is', null)
      .limit(1)
      .maybeSingle<{ slug: string }>()

    slug = data?.slug ?? null
  } catch {
    slug = null
  }

  domainCache.set(key, { slug, expires: Date.now() + CACHE_TTL_MS })
  return slug
}

export async function proxy(request: NextRequest) {
  const host = request.headers.get('host') || ''

  // A custom (non-platform) host that maps to a verified, published page gets
  // rewritten to that page so the brand domain serves the agent-optimized page.
  if (!isPlatformHost(host, SITE_URL)) {
    const slug = await resolveSlugForHost(host)
    if (slug) {
      const mapped = mapCustomDomainPath(slug, request.nextUrl.pathname)
      if (mapped !== request.nextUrl.pathname) {
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
