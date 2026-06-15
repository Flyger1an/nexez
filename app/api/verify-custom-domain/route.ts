import { NextRequest, NextResponse } from 'next/server'
import { cookies, headers } from 'next/headers'
import dns from 'dns'
import { promisify } from 'util'
import { createClient } from '../../../utils/supabase/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../utils/supabase/admin'
import { ownerAllows } from '../../../lib/server/plan'

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
 * Security: this route is owner-authenticated. The browser never marks a domain
 * verified directly; it only asks the server to verify DNS and persist the result.
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
  if (!customDomain || !pageId) {
    return NextResponse.json({ error: 'customDomain and pageId are required' }, { status: 400 })
  }

  const domain = normalizeDomain(customDomain)
  if (!domain || domain.includes(' ') || domain.length < 4) {
    return NextResponse.json({ error: 'Invalid domain' }, { status: 400 })
  }

  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'Domain verification is not configured on this deployment.' }, { status: 503 })
  }

  const cookieStore = await cookies()
  const host = (await headers()).get('host')
  const supabase = createClient(cookieStore, host)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Plan gate: verifying (enabling) a custom domain requires Launch+.
  if (!(await ownerAllows(supabase, user.id, 'customDomain'))) {
    return NextResponse.json({ error: 'Custom domains are available on the Launch plan and up.', upgrade: 'launch' }, { status: 402 })
  }

  const admin = createAdminClient()
  const { data: page, error: pageError } = await admin
    .from('pages')
    .select('id, owner_id, custom_domain')
    .eq('id', pageId)
    .eq('owner_id', user.id)
    .eq('custom_domain', domain)
    .maybeSingle<{ id: string; owner_id: string; custom_domain: string | null }>()

  if (pageError) {
    return NextResponse.json({ error: 'Could not load page for verification.' }, { status: 500 })
  }
  if (!page) {
    return NextResponse.json({ error: 'Save this domain on a page you own before verifying it.' }, { status: 403 })
  }

  const { data: secrets } = await admin
    .from('page_secrets')
    .select('domain_verification_token')
    .eq('page_id', page.id)
    .eq('owner_id', user.id)
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
        .eq('owner_id', user.id)
        .eq('custom_domain', domain)

      if (verifyError) {
        return NextResponse.json({ error: 'DNS verified, but saving verification failed.' }, { status: 500 })
      }

      await admin
        .from('page_secrets')
        .update({ domain_verification_token: null, updated_at: verifiedAt })
        .eq('page_id', page.id)
        .eq('owner_id', user.id)

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
    body: JSON.stringify({ customDomain: domain, token, pageId: searchParams.get('pageId') }),
    headers: { 'content-type': 'application/json' },
  })
  return POST(fakeReq)
}
