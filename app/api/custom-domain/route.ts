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
import { getOwnerPlanId } from '../../../lib/server/plan'
import { getPlanLimits, planAllows } from '../../../lib/billing'
import { resolvePageAccess } from '../../../lib/server/page-access'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../utils/supabase/admin'

/**
 * A2 — Custom domain provisioning (owner OR editor-collaborator).
 *
 * POST { action: 'attach' | 'status' | 'remove', domain }
 * - Resolves the page that uses this domain (service-role, by custom_domain) and
 *   authorizes the caller as the page OWNER or a non-revoked EDITOR invitee via
 *   resolvePageAccess. A collaborator inherits the page OWNER's plan + acts on the
 *   OWNER's data.
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

  // All owner-scoped reads/writes go through the service-role client: a collaborator's
  // session client cannot see the owner's rows under RLS, and resolvePageAccess is the
  // authoritative (and only) authorization here.
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
  const admin = createAdminClient()

  // Find the page that uses this domain authoritatively (service-role), by domain only —
  // we NEVER trust an owner_id from the client. The resolved page id is then handed to
  // resolvePageAccess, which authorizes the caller as the page's OWNER or a non-revoked
  // EDITOR invitee. (A domain may host several pages, so take the first match.)
  const { data: domainPages } = await admin
    .from('pages')
    .select('id, custom_domain, custom_domain_verified')
    .eq('custom_domain', domain)
    .limit(1)
    .returns<Array<{ id: string; custom_domain: string; custom_domain_verified: string | null }>>()

  const page = domainPages?.[0]
  if (!page) {
    return NextResponse.json(
      { error: 'No page you own uses this domain. Save the custom domain on the page first.' },
      { status: 403 },
    )
  }

  const access = await resolvePageAccess({
    pageId: page.id,
    userId: user.id,
    userEmail: user.email,
    requireEditor: true,
  })
  if (!access) {
    return NextResponse.json({ error: 'You do not have edit access to this page.' }, { status: 403 })
  }

  // Plan gate ON THE OWNER (not the logged-in collaborator): attaching a NEW custom domain
  // requires Launch+ AND must stay within the OWNER's plan customDomains count. Status
  // checks and removal stay open so a downgraded owner can still inspect/detach. (Free is
  // already blocked by the boolean; the count caps Launch=1 / Pro=5 / Scale=25 / Enterprise=∞.)
  if (action === 'attach') {
    const planId = await getOwnerPlanId(admin, access.ownerId)
    if (!planAllows(planId, 'customDomain')) {
      return NextResponse.json({ error: 'Custom domains are available on the Launch plan and up.', upgrade: 'launch' }, { status: 402 })
    }
    const limit = getPlanLimits(planId).customDomains
    if (Number.isFinite(limit)) {
      const { data: owned } = await admin
        .from('pages')
        .select('custom_domain')
        .eq('owner_id', access.ownerId)
        .not('custom_domain', 'is', null)
        .neq('custom_domain', domain)
        .returns<Array<{ custom_domain: string | null }>>()
      const distinct = new Set((owned ?? []).map((p) => p.custom_domain).filter(Boolean) as string[])
      if (distinct.size >= limit) {
        return NextResponse.json(
          {
            error: `Your plan includes ${limit} custom domain${limit === 1 ? '' : 's'}. Upgrade to connect more.`,
            upgrade: 'pro',
          },
          { status: 402 },
        )
      }
    }
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
