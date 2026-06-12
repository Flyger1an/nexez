import { NextResponse } from 'next/server'
import { MARKETING_HOST } from '../../../../lib/site'

// Best-effort, cross-domain auth hint for the marketing nav.
//
// nexez.ai is a different registrable domain, so it can't read the nexez.app session
// cookie (host-only + SameSite=Lax). This endpoint reads the non-sensitive
// `nx_authed` hint cookie (SameSite=None, set by the auth middleware) and reports it
// back to the marketing origin with credentialed CORS, so the nav can swap
// "Sign in / Get started" → "Dashboard" when the browser is signed in.
//
// It returns ONLY a boolean, carries no session data, and is never used for
// authorization. Works where the browser sends third-party cookies (Chrome); Safari
// ITP / Firefox TCP block that, and the nav simply falls back to the public CTAs.

const ALLOWED_ORIGINS = new Set([`https://${MARKETING_HOST}`, `https://www.${MARKETING_HOST}`])

function corsHeaders(origin: string | null): Record<string, string> {
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      Vary: 'Origin',
    }
  }
  return { Vary: 'Origin' }
}

export async function GET(request: Request) {
  const cookie = request.headers.get('cookie') || ''
  const authed = /(?:^|;\s*)nx_authed=1(?:;|$)/.test(cookie)
  return NextResponse.json(
    { authed },
    { headers: { ...corsHeaders(request.headers.get('origin')), 'Cache-Control': 'no-store' } },
  )
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...corsHeaders(request.headers.get('origin')),
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400',
    },
  })
}
