import { NextResponse } from 'next/server'
import { hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

/**
 * Lightweight, unauthenticated status for the programmatic API.
 * Reports only whether the API is configured (service-role env present) — never
 * any secret value. Lets operators confirm an env change took effect after deploy.
 */
export async function GET() {
  const configured = hasSupabaseAdminEnv()
  return NextResponse.json(
    {
      ok: true,
      service: 'nexez-api-v1',
      configured,
      message: configured
        ? 'Programmatic API is configured. Authenticate with Authorization: Bearer nxz_live_…'
        : 'Programmatic API is not configured (missing SUPABASE_SERVICE_ROLE_KEY).',
      timestamp: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
