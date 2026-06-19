import { NextResponse } from 'next/server'

/**
 * Lightweight, unauthenticated status for the programmatic API.
 * Deliberately avoids exposing whether privileged server secrets are configured.
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: 'nexez-api-v1',
      timestamp: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
