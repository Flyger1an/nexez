import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import dns from 'dns'
import { promisify } from 'util'
import { ownerAllows } from '../../../lib/server/plan'
import { requirePageAccess } from '../../../lib/server/require-page-access'
import { enforceRateLimit } from '../../../lib/rate-limit'
import { findDoubledRecordMessage } from '../../../lib/server/doubled-txt-probe'
import { getDomainStatus, isVercelDomainConfigured } from '../../../lib/vercel-domains'

const resolveTxt = promisify(dns.resolveTxt)

/**
 * Custom Domain Verification (Phase 5)
 * Real (not demo) TXT record check.
 *
 * Flow (called from authenticated Settings page):
 * 1. User enters custom_domain (e.g. agents.acme.com), saves page.
 * 2. "Generate verification token" in UI: creates a random token, persists it on the page record (domain_verification_token).
 *    Shows exact DNS instruction:
 *      _nexez-verify.agents.acme.com   IN TXT   "nexez-verify-<random-token>"
 * 3. User adds the TXT record at their DNS provider (TTL 300 or low).
 * 4. Click "Verify now": POSTs { pageId, customDomain, token } (or server can look up).
 *    This route performs DNS lookup for the _nexez-verify. subdomain.
 *    If the token value is present in any TXT record, returns { verified: true }.
 * 5. This route updates `custom_domain_verified` and clears the temp token.
 *
 * Security: this route is owner-OR-editor-authenticated via resolvePageAccess
 * (requireEditor) - the logged-in user may be the page owner or a non-revoked
 * editor-collaborator invited by that owner. Plan gate + all owner-scoped reads/
 * writes target the resolved PAGE OWNER (service-role), never the caller's id.
 * The browser never marks a domain verified directly; it only asks the server to
 * verify DNS and persist the result.
 *
 * Supports both full domain and subdomain. Strips protocol if pasted.
 */

function normalizeDomain(input: string): string {
  try {
    let d = input.trim().toLowerCase()
    if (d.startsWith('http://')) d = d.slice(7)
    if (d.startsWith('https://')) d = d.slice(8)
    d = d.split('/')[0] // remove path
    d = d.split(':')[0] // remove port
    return d
  } catch {
    return input.trim().toLowerCase()
  }
}

function getVerifyHost(domain: string): string {
  return `_nexez-verify.${domain}`
}

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'verify-custom-domain', 20, 60_000)
  if (limited) return limited

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { customDomain, token, pageId } = body || {}
  if (!customDomain || !pageId) {
    return NextResponse.json({ error: 'customDomain and pageId are required' }, { status: 400 })
  }

  const domain = normalizeDomain(customDomain)
  if (!domain || domain.includes(' ') || domain.length < 4) {
    return NextResponse.json({ error: 'Invalid domain' }, { status: 400 })
  }

  // Authorize the caller against THIS page as owner OR a non-revoked editor-collaborator.
  // The resolved owner is who everything below acts as; the caller's own id is never
  // used to scope a read or a write.
  const host = (await headers()).get('host')
  const gate = await requirePageAccess({
    pageId,
    host,
    unavailableMessage: 'Domain verification is not configured on this deployment.',
  })
  if (!gate.ok) return gate.response
  const { access, admin } = gate

  // Plan gate: verifying (enabling) a custom domain requires Launch+ - gated on the
  // PAGE OWNER's plan (the collaborator inherits it), not the logged-in caller.
  if (!(await ownerAllows(admin, access.ownerId, 'customDomain'))) {
    return NextResponse.json({ error: 'Custom domains are available on the Launch plan and up.', upgrade: 'launch' }, { status: 402 })
  }

  const { data: page, error: pageError } = await admin
    .from('pages')
    .select('id, owner_id, custom_domain')
    .eq('id', access.pageId)
    .eq('owner_id', access.ownerId)
    .eq('custom_domain', domain)
    .maybeSingle<{ id: string; owner_id: string; custom_domain: string | null }>()

  if (pageError) {
    return NextResponse.json({ error: 'Could not load page for verification.' }, { status: 500 })
  }
  if (!page) {
    return NextResponse.json({ error: 'Save this domain on a page you own before verifying it.' }, { status: 403 })
  }

  // A subdomain served through Vercel's CNAME path proves ownership through its
  // healthy provider attachment. Publishing a Nexez TXT record below that CNAME
  // is invalid DNS, so reject the legacy flow before reading or checking a token.
  if (isVercelDomainConfigured()) {
    const providerStatus = await getDomainStatus(domain)
    if (providerStatus.verificationMethod === 'cname') {
      return NextResponse.json(
        {
          verified: false,
          domain,
          verificationMethod: 'cname',
          code: 'CNAME_VERIFICATION_REQUIRED',
          message: 'TXT verification is not needed for this subdomain. Point its CNAME to cname.nexez.app, then check connection status.',
        },
        { status: 409 },
      )
    }
  }

  const { data: secrets } = await admin
    .from('page_secrets')
    .select('domain_verification_token')
    .eq('page_id', page.id)
    .eq('owner_id', access.ownerId)
    .maybeSingle<{ domain_verification_token: string | null }>()

  const expected = String(secrets?.domain_verification_token || '').trim()
  if (!expected) {
    return NextResponse.json({ error: 'Generate a verification token first.' }, { status: 400 })
  }

  if (token && String(token).trim() !== expected) {
    return NextResponse.json({ error: 'Verification token does not match the saved token for this page.' }, { status: 400 })
  }

  const verifyHost = getVerifyHost(domain)

  try {
    // Real DNS TXT lookup (works in Node / Vercel serverless)
    const records = await resolveTxt(verifyHost)
    const flat = records.map((chunks) => chunks.join('').trim())

    const matched = flat.some((val) => val === expected)

    if (matched) {
      const verifiedAt = new Date().toISOString()
      const { error: verifyError } = await admin
        .from('pages')
        .update({ custom_domain_verified: verifiedAt })
        .eq('id', page.id)
        .eq('owner_id', access.ownerId)
        .eq('custom_domain', domain)

      if (verifyError) {
        return NextResponse.json({ error: 'DNS verified, but saving verification failed.' }, { status: 500 })
      }

      await admin
        .from('page_secrets')
        .update({ domain_verification_token: null, updated_at: verifiedAt })
        .eq('page_id', page.id)
        .eq('owner_id', access.ownerId)

      return NextResponse.json({
        verified: true,
        domain,
        verifyHost,
        verifiedAt,
        message: 'DNS verification successful. Your domain is now verified.',
      })
    } else {
      return NextResponse.json({
        verified: false,
        domain,
        verifyHost,
        found: flat,
        message:
          (await findDoubledRecordMessage(domain, expected)) ||
          'TXT record found but token did not match. Make sure the exact value (including nexez-verify- prefix) is set and DNS has propagated.',
      }, { status: 200 }) // 200 so client can show helpful message
    }
  } catch (err: any) {
    // Common: ENOTFOUND, no records yet, DNS propagation delay, private DNS, etc.
    // Before blaming propagation, probe every zone-appended variant: registrars that
    // auto-append the ZONE turn a pasted record name into _nexez-verify.d.com.d.com
    // (or _nexez-verify.shop.d.com.d.com for a subdomain), which resolves fine but is
    // invisible here. That is the single most common cause of a "record published but
    // never verifies" report.
    console.warn('[verify-custom-domain] DNS lookup failed for', verifyHost, err?.code || err?.message)
    const doubledMessage = await findDoubledRecordMessage(domain, expected)
    if (doubledMessage) {
      return NextResponse.json({
        verified: false,
        domain,
        verifyHost,
        message: doubledMessage,
        code: 'DOUBLED_RECORD_NAME',
      }, { status: 200 })
    }
    return NextResponse.json({
      verified: false,
      domain,
      verifyHost,
      error: 'DNS lookup failed or no records found yet. Please confirm the TXT record is published and try again in a few minutes.',
      code: err?.code || 'DNS_ERROR',
    }, { status: 200 })
  }
}

// Optional GET for manual testing / status (not used in UI yet)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const domain = searchParams.get('domain')
  const token = searchParams.get('token')
  if (!domain || !token) {
    return NextResponse.json({ error: 'domain and token query params required' }, { status: 400 })
  }
  // Reuse POST's logic. Carry the original request's headers through so the
  // rate limit inside POST keys on the REAL client IP - a fresh header set
  // would give clientIp() an empty value and let this GET alias bypass the
  // per-IP limit POST enforces.
  const headers = new Headers(request.headers)
  headers.set('content-type', 'application/json')
  const fakeReq = new NextRequest(request.url, {
    method: 'POST',
    body: JSON.stringify({ customDomain: domain, token, pageId: searchParams.get('pageId') }),
    headers,
  })
  return POST(fakeReq)
}
