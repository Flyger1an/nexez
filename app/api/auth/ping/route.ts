import { NextResponse } from 'next/server'
import { APP_HOST, MARKETING_HOST } from '../../../../lib/site'

// Best-effort auth presence ping for same-site nexez.ai surfaces. Real
// authorization still uses Supabase getUser() inside protected routes.
const ALLOWED_ORIGINS = new Set([
  `https://${MARKETING_HOST}`,
  `https://www.${MARKETING_HOST}`,
  `https://${APP_HOST}`,
])

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
  const authed = /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.[0-9]+)?=/.test(cookie)
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
