import { NextResponse } from 'next/server'
import { captureError, captureEvent } from '../../../../lib/observability'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { hashScanLeadToken, isScanLeadToken } from '../../../../lib/server/scan-lead-token'
import { SCAN_ATTRIBUTION_COOKIE } from '../../../../lib/server/scan-lead'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

type AttributionRow = {
  id: string
  domain: string
  score: number | null
  onboarding_opened_at: string | null
}

/**
 * Bind an emailed or captured scan lead to the app-domain onboarding session.
 * The opaque token contains no address or domain. Only a hashed copy exists in
 * the database, and the browser receives an HttpOnly cookie for the auth callback.
 */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'scan-attribution', 20, 60_000, {
    failClosed: true,
  })
  if (limited) return limited

  let body: { token?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const token = body.token?.trim() ?? ''
  if (!isScanLeadToken(token)) {
    return NextResponse.json({ error: 'Invalid attribution token.' }, { status: 400 })
  }
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'Not available right now.' }, { status: 503 })
  }

  try {
    const admin = createAdminClient()
    const { data: lead, error } = await admin
      .from('scan_leads')
      .select('id, domain, score, onboarding_opened_at')
      .eq('onboarding_token_hash', hashScanLeadToken(token))
      .maybeSingle<AttributionRow>()

    if (error) {
      captureError(error, { route: 'scan-attribution', area: 'lookup' })
      return NextResponse.json({ error: 'Not available right now.' }, { status: 503 })
    }
    if (!lead) {
      return NextResponse.json({ error: 'This scan link is no longer available.' }, { status: 404 })
    }

    const openedAt = lead.onboarding_opened_at ?? new Date().toISOString()
    if (!lead.onboarding_opened_at) {
      const { error: updateError } = await admin
        .from('scan_leads')
        .update({ onboarding_opened_at: openedAt })
        .eq('id', lead.id)
        .is('onboarding_opened_at', null)
      if (updateError) {
        captureError(updateError, { route: 'scan-attribution', area: 'stamp' })
        return NextResponse.json({ error: 'Not available right now.' }, { status: 503 })
      }
      captureEvent('scan.onboarding_opened', { host: lead.domain, score: lead.score })
    }

    const response = NextResponse.json({
      ok: true,
      domain: lead.domain,
      score: lead.score,
    }, { headers: { 'Cache-Control': 'no-store' } })
    response.cookies.set(SCAN_ATTRIBUTION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    })
    return response
  } catch (error) {
    captureError(error, { route: 'scan-attribution' })
    return NextResponse.json({ error: 'Not available right now.' }, { status: 503 })
  }
}
