import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../utils/supabase/server'
import {
  addDomainToProject,
  deriveDomainState,
  getDomainStatus,
  isVercelDomainConfigured,
  removeDomainFromProject,
  type VercelDomainStatus,
} from '../../../lib/vercel-domains'

/**
 * A2 — Custom domain provisioning (owner-authed).
 *
 * POST { action: 'attach' | 'status' | 'remove', domain }
 * - Verifies the caller owns a page whose custom_domain === domain.
 * - Attaches/inspects/removes the domain on the hosting provider (Vercel).
 * - Returns the derived connection-wizard state (Pending DNS → Verifying →
 *   SSL Issuing → Live), combining provider status + our DNS ownership proof.
 */

function normalizeDomain(input: string): string {
  let d = (input || '').trim().toLowerCase()
  if (d.startsWith('http://')) d = d.slice(7)
  if (d.startsWith('https://')) d = d.slice(8)
  d = d.split('/')[0] ?? ''
  d = d.split(':')[0] ?? ''
  return d
}

export async function POST(request: Request) {
  let body: { action?: string; domain?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const action = body.action || 'status'
  const domain = normalizeDomain(body.domain || '')
  if (!domain || domain.length < 4) {
    return NextResponse.json({ error: 'A valid domain is required' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Authorize: the user must own at least one page that uses this domain.
  // (A domain may host several pages, so take the first match.)
  const { data: pages } = await supabase
    .from('pages')
    .select('id, custom_domain, custom_domain_verified')
    .eq('owner_id', user.id)
    .eq('custom_domain', domain)
    .limit(1)
    .returns<Array<{ id: string; custom_domain: string; custom_domain_verified: string | null }>>()

  const page = pages?.[0]
  if (!page) {
    return NextResponse.json(
      { error: 'No page you own uses this domain. Save the custom domain on the page first.' },
      { status: 403 },
    )
  }

  const providerConfigured = isVercelDomainConfigured()
  const ownershipVerified = Boolean(page.custom_domain_verified)

  let status: VercelDomainStatus = { attached: false, verified: false, misconfigured: false, requiredRecords: [] }

  if (providerConfigured && action !== 'remove') {
    status = action === 'attach' ? await addDomainToProject(domain) : await getDomainStatus(domain)
  } else if (providerConfigured && action === 'remove') {
    const removed = await removeDomainFromProject(domain)
    return NextResponse.json({ ok: removed.ok, removed: removed.ok, error: removed.error })
  }

  const derived = deriveDomainState({
    hasDomain: true,
    ownershipVerified,
    providerConfigured,
    attached: status.attached,
    providerVerified: status.verified,
    misconfigured: status.misconfigured,
    errored: Boolean(status.error && status.error !== 'not_configured'),
  })

  return NextResponse.json({
    ok: true,
    domain,
    providerConfigured,
    ownershipVerified,
    provider: providerConfigured ? status : null,
    state: derived.state,
    label: derived.label,
    detail: derived.detail,
    requiredRecords: status.requiredRecords,
  })
}
