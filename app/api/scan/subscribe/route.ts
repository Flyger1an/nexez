import { NextResponse } from 'next/server'
import { evaluateCrawlability } from '../../../../lib/crawlability'
import { captureError, captureEvent } from '../../../../lib/observability'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { selectScanFindings } from '../../../../lib/scan-findings'
import {
  deriveScanLeadToken,
  deriveScanOnboardingToken,
  hashScanLeadToken,
} from '../../../../lib/server/scan-lead-token'
import { gatherSiteSignals, normalizeScanUrl } from '../../../../lib/server/site-scan'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

// Re-runs the scan, so it inherits /api/scan's fetch budget.
export const maxDuration = 30

/**
 * "Email me this scan" on the public scan page. The visitor has no account, so
 * their request IS the consent, and it is stored on the row that holds the
 * address rather than asserted somewhere else.
 *
 * The scan is re-run here instead of trusting a score posted by the client. A
 * score is the entire claim the email makes; accepting one from the browser would
 * let anyone mail an arbitrary verdict about someone else's business from our
 * domain. The extra fetch is the price of that not being possible.
 *
 * Delivery is the cron's job, not this request's: a send inline would make the
 * visitor wait on Resend and would lose the email if the response was abandoned.
 */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'scan-subscribe', 3, 60_000)
  if (limited) return limited

  let body: { url?: string; email?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const email = (body.email || '').trim().toLowerCase()
  // Deliberately permissive: the real proof an address exists is that the mail
  // arrives. This only rejects what cannot be an address at all.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  // Bound sends to one recipient across rotating IPs. Hash the address before it
  // becomes a rate-limit key so the backing store never receives contact data.
  const recipientLimited = await enforceRateLimit(request, 'scan-recipient', 5, 86_400_000, {
    subject: `recipient:${hashScanLeadToken(email)}`,
    failClosed: true,
  })
  if (recipientLimited) return recipientLimited

  const normalized = normalizeScanUrl(body.url || '')
  if (!normalized) {
    return NextResponse.json({ error: 'Enter a valid website address.' }, { status: 400 })
  }
  const domain = new URL(normalized).hostname.toLowerCase()

  // Same per-target ceiling as /api/scan, fail-closed: this route is a cheaper way
  // to make us fetch a third party's site repeatedly, so it must not be looser.
  const targetLimited = await enforceRateLimit(request, 'scan-target', 30, 60_000, {
    subject: `target:${domain}`,
    failClosed: true,
  })
  if (targetLimited) return targetLimited

  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'Not available right now.' }, { status: 503 })
  }

  try {
    const admin = createAdminClient()
    const { data: suppression, error: suppressionError } = await admin
      .from('scan_lead_suppressions')
      .select('email')
      .eq('email', email)
      .maybeSingle<{ email: string }>()

    if (suppressionError) {
      captureError(suppressionError, { route: 'scan-subscribe', area: 'suppression-check' })
      return NextResponse.json({ error: 'Not available right now.' }, { status: 503 })
    }
    if (suppression) {
      captureEvent('scan.subscribe.suppressed', { host: domain })
      return NextResponse.json({ ok: true, queued: false }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const result = await gatherSiteSignals(normalized)
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    const report = evaluateCrawlability(result.signals)
    const findings = selectScanFindings(report.checks)

    // Re-scanning the same site refreshes the result and re-queues delivery, but
    // never resurrects an unsubscribed row: the database rejects clearing that
    // stamp, and the queue index excludes it regardless.
    const { data: existing } = await admin
      .from('scan_leads')
      .select('id, unsubscribed_at, delivered_at, abandoned_at')
      .eq('email', email)
      .eq('domain', domain)
      .maybeSingle<{
        id: string
        unsubscribed_at: string | null
        delivered_at: string | null
        abandoned_at: string | null
      }>()

    if (existing?.unsubscribed_at || existing?.delivered_at || existing?.abandoned_at) {
      // Say it worked. Confirming that an address is suppressed would turn this
      // endpoint into a way to test whether someone has unsubscribed.
      captureEvent('scan.subscribe.suppressed', { host: domain })
      return NextResponse.json({ ok: true, queued: false }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const row = {
      email,
      domain,
      score: report.score,
      findings,
      last_error: null,
      consent_source: 'scan_page' as const,
    }

    // The id is minted here rather than by the default, because the unsubscribe
    // token is derived from it and the row has to carry that token's hash from the
    // moment it exists. No row is ever queued without a working unsubscribe.
    const id = existing?.id ?? crypto.randomUUID()
    const onboardingToken = deriveScanOnboardingToken(id)
    const { error } = existing
      ? await admin.from('scan_leads').update({
        ...row,
        onboarding_token_hash: hashScanLeadToken(onboardingToken),
      }).eq('id', existing.id)
      : await admin.from('scan_leads').insert({
        ...row,
        id,
        consented_at: new Date().toISOString(),
        unsubscribe_token_hash: hashScanLeadToken(deriveScanLeadToken(id)),
        onboarding_token_hash: hashScanLeadToken(onboardingToken),
      })

    if (error) {
      captureError(error, { route: 'scan-subscribe' })
      return NextResponse.json({ error: 'Could not queue that. Please try again.' }, { status: 500 })
    }

    captureEvent('scan.subscribe', { host: domain, score: report.score, repeat: Boolean(existing) })
    return NextResponse.json(
      { ok: true, queued: true, score: report.score, attributionToken: onboardingToken },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    captureError(error, { route: 'scan-subscribe' })
    return NextResponse.json({ error: 'Scan failed. Please try again.' }, { status: 500 })
  }
}
