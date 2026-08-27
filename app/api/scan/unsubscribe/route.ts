import { NextResponse } from 'next/server'
import { captureError } from '../../../../lib/observability'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { hashScanLeadToken, isScanLeadToken } from '../../../../lib/server/scan-lead-token'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

export const maxDuration = 15

/**
 * Unsubscribe for the emailed scan result.
 *
 * GET renders a one-button confirmation and changes NOTHING. Mail clients and
 * security scanners prefetch links in messages, so a GET that unsubscribed would
 * silently suppress people who never clicked. POST is the only thing that writes.
 *
 * POST also serves RFC 8058 one-click unsubscribe, which is what the
 * List-Unsubscribe-Post header on the scan email promises Gmail and Yahoo.
 */

const PAGE_STYLE = 'font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;'
  + 'max-width:34rem;margin:12vh auto;padding:0 1.5rem;color:#0D1016'

function page(title: string, bodyHtml: string, status = 200) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${title}</title><body style="${PAGE_STYLE}">${bodyHtml}</body>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  )
}

async function suppress(token: string): Promise<'ok' | 'unknown' | 'error'> {
  if (!hasSupabaseAdminEnv()) return 'error'
  const admin = createAdminClient()
  const { data: lead, error: lookupError } = await admin
    .from('scan_leads')
    .select('id, email')
    .eq('unsubscribe_token_hash', hashScanLeadToken(token))
    .maybeSingle<{ id: string; email: string }>()

  if (lookupError) {
    captureError(lookupError, { route: 'scan-unsubscribe', area: 'lookup' })
    return 'error'
  }
  if (!lead) return 'unknown'

  // The database trigger applies this address-wide and clears any in-flight
  // claims in the same transaction. A unique conflict means the address was
  // already suppressed, which is still success.
  const { error: suppressionError } = await admin.from('scan_lead_suppressions').insert({
    email: lead.email,
    source_lead_id: lead.id,
  })
  if (suppressionError && suppressionError.code !== '23505') {
    captureError(suppressionError, { route: 'scan-unsubscribe', area: 'suppress' })
    return 'error'
  }
  // No row means either a bad token or an address already suppressed. Both are
  // reported as success: the caller learns nothing either way, and an unsubscribe
  // endpoint that distinguishes them is an address oracle.
  return 'ok'
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('t') || ''
  if (!isScanLeadToken(token)) {
    return page('Link not recognised', '<h1>That link is not valid</h1>'
      + '<p>It may have been truncated by your mail client. You can also reply to the email and we will remove you by hand.</p>', 400)
  }
  const safe = token.replace(/[^A-Za-z0-9_-]/g, '')
  return page(
    'Unsubscribe',
    '<h1>Stop scan-result emails?</h1>'
    + '<p>Confirm and we will suppress this address from all future scan-result emails.</p>'
    + `<form method="post" action="/api/scan/unsubscribe?t=${safe}">`
    + '<button type="submit" style="font:inherit;background:#C94719;color:#fff;border:0;'
    + 'border-radius:999px;padding:0.85rem 1.6rem;cursor:pointer">Unsubscribe</button></form>',
  )
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'scan-unsubscribe', 20, 60_000)
  if (limited) return limited

  const url = new URL(request.url)
  let token = url.searchParams.get('t') || ''
  if (!token) {
    // One-click senders POST an empty or form-encoded body to the URL as given, so
    // the token normally rides in the query string. Accept a form field too.
    try {
      const form = await request.formData()
      token = String(form.get('t') || '')
    } catch {
      token = ''
    }
  }

  if (!isScanLeadToken(token)) {
    return page('Link not recognised', '<h1>That link is not valid</h1>'
      + '<p>Reply to the email and we will remove you by hand.</p>', 400)
  }

  const outcome = await suppress(token)
  if (outcome === 'error') {
    return page('Something went wrong', '<h1>We could not complete that</h1>'
      + '<p>Please try again shortly, or reply to the email and we will remove you by hand.</p>', 503)
  }

  return page('Unsubscribed', '<h1>Done</h1><p>This address will not receive another scan-result email.</p>')
}
