import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Basic middleware (Phase 5 foundation for custom domains + other platform concerns).
 *
 * Current: pass-through + lightweight observability headers.
 * Future (when custom domains verified + DNS point to Vercel):
 *   - If the incoming host matches a verified custom_domain for a published page,
 *     we can rewrite or add x-nexez-custom-domain header so pages can render branded links.
 *   - Support for /<slug> under custom host mapping if needed.
 *
 * For now this keeps the app ready. Real custom domain users will typically alias their
 * subdomain at the Vercel project level; the verification flow proves ownership via DNS.
 */
export function middleware(request: NextRequest) {
  const res = NextResponse.next()

  // Lightweight observability / debugging for custom domain flows
  const host = request.headers.get('host') || ''
  if (host) {
    res.headers.set('x-nexez-incoming-host', host)
  }

  // Placeholder: in a more advanced impl we could look up pages by custom_domain
  // and set a verified flag or rewrite, but that requires DB on edge (or cache).
  // The authoritative "is this domain verified for this page" lives on the page record
  // and is surfaced in Settings + agent manifests today.

  return res
}

export const config = {
  matcher: [
    // Apply to all routes except static assets and api internals we don't need
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
