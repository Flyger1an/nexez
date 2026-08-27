import { NextResponse } from 'next/server'
import { buildScanResultsEmail, hasEmailEnv, sendEmail } from '../../../../lib/email'
import { captureError } from '../../../../lib/observability'
import type { ScanFinding } from '../../../../lib/scan-findings'
import { deriveScanLeadToken } from '../../../../lib/server/scan-lead-token'
import { appUrl, marketingUrl } from '../../../../lib/site'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

export const maxDuration = 60

const BATCH_LIMIT = 100
// Three failures is enough to distinguish a provider blip from an address that
// will never accept mail. Past that the row stops being retried, which keeps a
// dead address from consuming a slot in every run for the rest of time.
const MAX_DELIVERY_ATTEMPTS = 3
const STALE_CLAIM_MS = 15 * 60_000

type LeadRow = {
  id: string
  email: string
  domain: string
  score: number | null
  findings: unknown
  delivery_attempts: number
  delivery_claimed_at: string | null
}

function cronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret && process.env.NODE_ENV === 'production') return 'not_configured'
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) return 'unauthorized'
  return 'ok'
}

// findings is jsonb, so it is whatever was written. Anything that is not a pair of
// strings is dropped rather than rendered as "[object Object]" in a stranger's inbox.
function readFindings(value: unknown): ScanFinding[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry): ScanFinding[] =>
    Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'string'
      ? [[entry[0], entry[1]]]
      : [])
}

/**
 * Delivers scan results that visitors asked for on the public scan page.
 *
 * Sending happens here rather than in the request so the visitor never waits on
 * the mail provider and an abandoned response cannot lose the email. The claim is
 * a conditional update on delivered_at, so two overlapping runs cannot both take
 * the same row.
 */
export async function GET(request: Request) {
  const auth = cronAuthorized(request)
  if (auth === 'not_configured') {
    return NextResponse.json({ ok: false, error: 'cron_secret_not_configured' }, { status: 503 })
  }
  if (auth === 'unauthorized') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  }
  if (!hasEmailEnv()) {
    return NextResponse.json({ ok: true, sent: 0, skipped: 'email_disabled' })
  }

  const admin = createAdminClient()
  const nowIso = new Date().toISOString()
  const staleClaimIso = new Date(Date.now() - STALE_CLAIM_MS).toISOString()
  const errors: string[] = []
  let sent = 0
  let abandoned = 0

  const { data: leads, error: queueError } = await admin
    .from('scan_leads')
    .select('id, email, domain, score, findings, delivery_attempts, delivery_claimed_at')
    .is('delivered_at', null)
    .is('abandoned_at', null)
    .is('unsubscribed_at', null)
    .or(`delivery_claimed_at.is.null,delivery_claimed_at.lt.${staleClaimIso}`)
    .lt('delivery_attempts', MAX_DELIVERY_ATTEMPTS)
    .order('consented_at', { ascending: true })
    .limit(BATCH_LIMIT)
    .returns<LeadRow[]>()

  if (queueError) {
    captureError(queueError, { route: 'cron-scan-results' })
    return NextResponse.json({ ok: false, error: 'queue_unavailable' }, { status: 503 })
  }

  for (const lead of leads ?? []) {
    // Claim first. A timestamp distinct from delivered_at lets a later run recover
    // the row if this process dies between the claim and the provider response.
    const { data: claimed } = await admin
      .from('scan_leads')
      .update({ delivery_claimed_at: nowIso, delivery_attempts: lead.delivery_attempts + 1 })
      .eq('id', lead.id)
      .is('delivered_at', null)
      .is('abandoned_at', null)
      .is('unsubscribed_at', null)
      .or(`delivery_claimed_at.is.null,delivery_claimed_at.lt.${staleClaimIso}`)
      .select('id')
      .maybeSingle<{ id: string }>()
    if (!claimed) continue

    const token = deriveScanLeadToken(lead.id)
    // The unsubscribe lives beside the scanner on the marketing host, which is the
    // host the recipient just used. The listing builder is on the app host.
    const unsubscribeUrl = marketingUrl(`/api/scan/unsubscribe?t=${token}`)

    try {
      const mail = await buildScanResultsEmail({
        domain: lead.domain,
        score: lead.score ?? 0,
        findings: readFindings(lead.findings),
        claimUrl: appUrl('/create?ref=scan'),
        unsubscribeUrl,
      })
      const result = await sendEmail({
        to: lead.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        // One send per lead, ever, even if a retry races the claim.
        idempotencyKey: `scan-result-${lead.id}`,
        tags: [{ name: 'stream', value: 'scan-result' }],
        // Gmail and Yahoo surface a native unsubscribe from these, which keeps
        // complaints off the spam button and off the sending domain's reputation.
        messageHeaders: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      })

      if (!result.ok) {
        const exhausted = lead.delivery_attempts + 1 >= MAX_DELIVERY_ATTEMPTS
        if (exhausted) abandoned += 1
        await admin
          .from('scan_leads')
          .update({
            delivery_claimed_at: null,
            ...(exhausted ? { abandoned_at: nowIso } : {}),
            last_error: (result.error || 'send failed').slice(0, 500),
          })
          .eq('id', lead.id)
        errors.push(`scan_result_send:${lead.id}`)
        continue
      }
      await admin.from('scan_leads').update({
        delivered_at: nowIso,
        delivery_claimed_at: null,
        provider_message_id: result.id ?? null,
        last_error: null,
      }).eq('id', lead.id)
      sent += 1
    } catch (error) {
      captureError(error, { route: 'cron-scan-results', leadId: lead.id })
      const exhausted = lead.delivery_attempts + 1 >= MAX_DELIVERY_ATTEMPTS
      if (exhausted) abandoned += 1
      await admin.from('scan_leads').update({
        delivery_claimed_at: null,
        ...(exhausted ? { abandoned_at: nowIso } : {}),
        last_error: (error instanceof Error ? error.message : 'email build failed').slice(0, 500),
      }).eq('id', lead.id)
      errors.push(`scan_result_build:${lead.id}`)
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    sent,
    abandoned,
    scanned: leads?.length ?? 0,
    ...(errors.length ? { errors } : {}),
    ranAt: nowIso,
  })
}
