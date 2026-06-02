import { NextRequest, NextResponse } from 'next/server'
import dns from 'dns'
import { promisify } from 'util'

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
 * 5. Client then updates the page (custom_domain_verified: new Date().toISOString() ) and clears the temp token.
 *
 * Security: This route is intentionally callable without auth (the hard part is controlling the DNS for the domain).
 * The caller (Settings) is already owner-authenticated and can only update their own page.
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
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { customDomain, token, pageId } = body || {}
  if (!customDomain || !token) {
    return NextResponse.json({ error: 'customDomain and token are required' }, { status: 400 })
  }

  const domain = normalizeDomain(customDomain)
  if (!domain || domain.includes(' ') || domain.length < 4) {
    return NextResponse.json({ error: 'Invalid domain' }, { status: 400 })
  }

  const verifyHost = getVerifyHost(domain)
  const expected = String(token).trim()

  try {
    // Real DNS TXT lookup (works in Node / Vercel serverless)
    const records = await resolveTxt(verifyHost)
    const flat = records.flat().map((r) => r.trim())

    const matched = flat.some((val) => val === expected || val.includes(expected))

    if (matched) {
      return NextResponse.json({
        verified: true,
        domain,
        verifyHost,
        message: 'DNS verification successful. You can now mark the domain verified on your page.',
      })
    } else {
      return NextResponse.json({
        verified: false,
        domain,
        verifyHost,
        found: flat,
        message: 'TXT record found but token did not match. Make sure the exact value (including nexez-verify- prefix) is set and DNS has propagated.',
      }, { status: 200 }) // 200 so client can show helpful message
    }
  } catch (err: any) {
    // Common: ENOTFOUND, no records yet, DNS propagation delay, private DNS, etc.
    console.warn('[verify-custom-domain] DNS lookup failed for', verifyHost, err?.code || err?.message)
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
  // Reuse logic by faking a body
  const fakeReq = new NextRequest(request.url, {
    method: 'POST',
    body: JSON.stringify({ customDomain: domain, token }),
    headers: { 'content-type': 'application/json' },
  })
  return POST(fakeReq)
}
