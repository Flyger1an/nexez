import { NextRequest, NextResponse } from 'next/server'
import { cookies, headers } from 'next/headers'
import dns from 'dns'
import { promisify } from 'util'
import { requirePageAccess } from '../../../../../lib/server/require-page-access'
import { enforceRateLimit } from '../../../../../lib/rate-limit'
import { getImportUrlError, getResolvedImportUrlError, safeFetch } from '../../../../../lib/importer'
import { readBodyCapped } from '../../../../../lib/server/site-scan'
import { captureEvent } from '../../../../../lib/observability'
import { APP_HOST, MARKETING_HOST, AGENT_RUNTIME_HOST } from '../../../../../lib/site'
import { findDoubledRecordMessage } from '../../../../../lib/server/doubled-txt-probe'
import {
  entitlementAllocationRetryBody,
  entitlementAllocationRetryInit,
  isEntitlementAllocationRetry,
} from '../../../../../lib/entitlement-allocation-error'
import {
  matchesVerificationFile,
  matchesVerificationMeta,
  verificationTxtHost,
  websiteHostOf,
  WELL_KNOWN_VERIFY_PATH,
} from '../../../../../lib/website-verification'

const resolveTxt = promisify(dns.resolveTxt)

// Meta fetch (one external GET) - bounded.
export const maxDuration = 20

const METHODS = ['dns', 'meta', 'file'] as const
type VerifyMethod = (typeof METHODS)[number]

const NEXEZ_HOSTS = new Set([MARKETING_HOST, APP_HOST, AGENT_RUNTIME_HOST].filter(Boolean))

/**
 * Prove the caller controls the EXISTING website (pages.website_url) WITHOUT pointing
 * DNS at Nexez. Unlike custom-domain verification this confers no routing rights, so
 * there is NO plan gate - it is the funnel wedge, available on every tier.
 *
 * Owner-OR-editor authenticated via resolvePageAccess; all reads/writes act as the
 * resolved PAGE OWNER (service role). The browser never sets website_verified_at
 * directly (a DB trigger reverts any such attempt) - it only asks the server to check.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(request, 'verify-website', 10, 60_000)
  if (limited) return limited

  const { id: pageId } = await ctx.params

  let body: { method?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const method = String(body.method || '') as VerifyMethod
  if (!METHODS.includes(method)) {
    return NextResponse.json({ error: 'method must be one of dns, meta, file' }, { status: 400 })
  }

  const host = (await headers()).get('host')
  const gate = await requirePageAccess({
    pageId,
    host,
    unavailableMessage: 'Website verification is not configured on this deployment.',
  })
  if (!gate.ok) return gate.response
  const { access, admin } = gate

  const { data: page, error: pageError } = await admin
    .from('pages')
    .select('id, owner_id, website_url')
    .eq('id', access.pageId)
    .eq('owner_id', access.ownerId)
    .maybeSingle<{ id: string; owner_id: string; website_url: string | null }>()
  if (pageError) {
    return NextResponse.json({ error: 'Could not load listing for verification.' }, { status: 500 })
  }
  if (!page) {
    return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })
  }

  const site = (page.website_url || '').trim()
  const host2 = websiteHostOf(site)
  if (!site || !host2) {
    return NextResponse.json({ error: 'Add your website URL to this listing first, then verify it.' }, { status: 400 })
  }
  if (NEXEZ_HOSTS.has(host2)) {
    return NextResponse.json({ error: 'That is a Nexez host - set your own website URL to verify.' }, { status: 400 })
  }

  const { data: secrets } = await admin
    .from('page_secrets')
    .select('website_verification_token')
    .eq('page_id', page.id)
    .eq('owner_id', access.ownerId)
    .maybeSingle<{ website_verification_token: string | null }>()
  const expected = String(secrets?.website_verification_token || '').trim()
  if (!expected) {
    return NextResponse.json({ error: 'Generate a verification token first.' }, { status: 400 })
  }

  // Resolve a canonical https origin for the site (used by meta + file methods).
  const normalizedSite = /^https?:\/\//i.test(site) ? site : `https://${site}`
  let matched = false
  let detail: string | undefined

  try {
    if (method === 'dns') {
      const records = await resolveTxt(verificationTxtHost(host2)).catch((err) => {
        // ENOTFOUND/ENODATA here is the normal "nothing published yet" case; we
        // still want to probe the doubled name below before reporting failure.
        if (err?.code === 'ENOTFOUND' || err?.code === 'ENODATA') return [] as string[][]
        throw err
      })
      const flat = records.map((chunks) => chunks.join('').trim())
      matched = flat.some((val) => val === expected)
      if (!matched) {
        // Probe every zone-appended variant before blaming propagation.
        detail =
          (await findDoubledRecordMessage(host2, expected)) ||
          'TXT record not found or token did not match yet (DNS can take a few minutes).'
      }
    } else if (method === 'meta') {
      const urlError = getImportUrlError(normalizedSite) || (await getResolvedImportUrlError(normalizedSite))
      if (urlError) return NextResponse.json({ error: urlError }, { status: 400 })
      const res = await safeFetch(normalizedSite, { headers: { 'User-Agent': 'Nexez Site Verifier/1.0' } }, { timeoutMs: 6500 })
      const html = res && res.ok ? await readBodyCapped(res, 512 * 1024) : null
      matched = !!html && matchesVerificationMeta(html, expected)
      if (!matched) detail = 'Meta tag not found on the homepage. Confirm it is in the <head> and the page is public.'
    } else {
      // file
      const fileUrl = new URL(WELL_KNOWN_VERIFY_PATH, normalizedSite).toString()
      const urlError = getImportUrlError(fileUrl) || (await getResolvedImportUrlError(fileUrl))
      if (urlError) return NextResponse.json({ error: urlError }, { status: 400 })
      const res = await safeFetch(fileUrl, { headers: { 'User-Agent': 'Nexez Site Verifier/1.0' } }, { timeoutMs: 6500 })
      const text = res && res.ok ? await readBodyCapped(res, 4096) : null
      matched = !!text && matchesVerificationFile(text, expected)
      if (!matched) detail = `File not found or token did not match at ${WELL_KNOWN_VERIFY_PATH}.`
    }
  } catch (err) {
    return NextResponse.json(
      { verified: false, method, host: host2, error: 'Verification check failed. Confirm the record/tag/file is published, then retry.', code: (err as { code?: string })?.code || 'VERIFY_ERROR' },
      { status: 200 },
    )
  }

  if (!matched) {
    return NextResponse.json({ verified: false, method, host: host2, message: detail || 'Not verified yet.' }, { status: 200 })
  }

  const verifiedAt = new Date().toISOString()
  const { error: verifyError } = await admin
    .from('pages')
    .update({ website_verified_at: verifiedAt, website_verified_method: method })
    .eq('id', page.id)
    .eq('owner_id', access.ownerId)
  if (verifyError) {
    if (isEntitlementAllocationRetry(verifyError)) {
      return NextResponse.json(entitlementAllocationRetryBody, entitlementAllocationRetryInit)
    }
    return NextResponse.json({ error: 'Verified, but saving the result failed. Please retry.' }, { status: 500 })
  }
  await admin
    .from('page_secrets')
    .update({ website_verification_token: null, updated_at: verifiedAt })
    .eq('page_id', page.id)
    .eq('owner_id', access.ownerId)

  captureEvent('website.verified', { method, host: host2 })

  return NextResponse.json({ verified: true, method, host: host2, verifiedAt })
}
