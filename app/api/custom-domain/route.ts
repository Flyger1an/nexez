import { NextResponse } from 'next/server'
import {
  addDomainToProject,
  deriveDomainState,
  getDomainStatus,
  isCnameProviderProof,
  isVercelDomainConfigured,
  removeDomainFromProject,
  type VercelDomainStatus,
} from '../../../lib/vercel-domains'
import { getOwnerPlanId } from '../../../lib/server/plan'
import { getBillingPlan, getFeatureUpgradeDecision, getLimitUpgradeDecision, getPlanLimits } from '../../../lib/billing'
import { requirePageAccess } from '../../../lib/server/require-page-access'
import { hasLegacyCustomDomainTxt } from '../../../lib/server/doubled-txt-probe'
import { hasExpectedCname } from '../../../lib/server/cname-probe'
import { getCustomDomainClaim } from '../../../lib/server/custom-domain-claim'
import {
  entitlementAllocationRetryBody,
  entitlementAllocationRetryInit,
  isEntitlementAllocationRetry,
} from '../../../lib/entitlement-allocation-error'

const NEXEZ_CNAME = 'cname.nexez.app'

function allocationRetryResponse() {
  return NextResponse.json(entitlementAllocationRetryBody, entitlementAllocationRetryInit)
}

/**
 * A2 - Custom domain provisioning (owner OR editor-collaborator).
 *
 * POST { action: 'claim' | 'attach' | 'status' | 'remove', domain, pageId? }
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
  let body: { action?: string; domain?: string; pageId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const action = body.action || 'status'
  if (action !== 'claim' && action !== 'attach' && action !== 'status' && action !== 'remove') {
    return NextResponse.json({ error: 'Unsupported domain action' }, { status: 400 })
  }
  const domain = normalizeDomain(body.domain || '')
  if (!domain || domain.length < 4) {
    return NextResponse.json({ error: 'A valid domain is required' }, { status: 400 })
  }

  // The page that uses this domain is resolved service-role, by domain only: an
  // owner_id from the client is never trusted. The id it yields is what gets
  // authorized. (A domain may host several pages, so take the first match.)
  let page!: { id: string; custom_domain: string; custom_domain_verified: string | null }

  const gate = await requirePageAccess({
    pageId: async (admin) => {
      let pageQuery = admin
        .from('pages')
        .select('id, custom_domain, custom_domain_verified')
        .eq('custom_domain', domain)

      if (body.pageId) pageQuery = pageQuery.eq('id', body.pageId)

      const { data: domainPages } = await pageQuery
        .limit(1)
        .returns<Array<{ id: string; custom_domain: string; custom_domain_verified: string | null }>>()

      const match = domainPages?.[0]
      if (!match) {
        return NextResponse.json(
          { error: 'No page you own uses this domain. Save the custom domain on the page first.' },
          { status: 403 },
        )
      }
      page = match
      return page.id
    },
  })
  if (!gate.ok) return gate.response
  const { access, admin } = gate
  const claimResult = await getCustomDomainClaim(admin, access.pageId)
  if (claimResult.error) {
    return NextResponse.json(
      { error: 'Custom-domain claim status is temporarily unavailable.' },
      { status: 503 },
    )
  }
  let claim = claimResult.claim
  const claimAvailable = claim?.available === true
  const claimLost = !claim?.owned && !claimAvailable
  const claimInactive = claimLost || claimAvailable

  if (action === 'claim') {
    return NextResponse.json({ ok: true, domain, claim })
  }

  if (claimInactive && action !== 'remove') {
    return NextResponse.json(
      {
        error: claimAvailable
          ? 'This listing no longer holds a reservation, but the domain is available. Remove it, then add it again.'
          : 'This domain is no longer reserved for this listing. Remove it or enter a different domain.',
        code: claimAvailable ? 'custom_domain_claim_available' : 'custom_domain_claim_lost',
        claim,
      },
      { status: 409 },
    )
  }
  let quotaRaceUpgrade: string | null = null
  let allocationChecked = false

  async function customDomainAllocationError(): Promise<NextResponse | null> {
    if (allocationChecked) return null
    allocationChecked = true

    const planId = await getOwnerPlanId(admin, access.ownerId)
    const featureDecision = getFeatureUpgradeDecision(planId, 'customDomain')
    if (!featureDecision.allowed) {
      const required = getBillingPlan(featureDecision.minimumPlanId)
      return NextResponse.json(
        {
          error: `Custom domains are available on the ${required?.name ?? 'required'} plan and up.`,
          code: 'plan_feature_required',
          upgrade: featureDecision.upgradePlanId,
        },
        { status: 402 },
      )
    }

    const limit = getPlanLimits(planId).customDomains
    if (!Number.isFinite(limit)) return null

    quotaRaceUpgrade = getLimitUpgradeDecision(planId, 'customDomains', limit + 1).upgradePlanId
    const { data: owned } = await admin
      .from('pages')
      .select('custom_domain, custom_domain_verified')
      .eq('owner_id', access.ownerId)
      .not('custom_domain', 'is', null)
      .not('custom_domain_verified', 'is', null)
      .neq('custom_domain', domain)
      .returns<Array<{ custom_domain: string | null; custom_domain_verified: string | null }>>()
    const distinct = new Set(
      (owned ?? [])
        .map((ownedPage) => ownedPage.custom_domain?.trim().toLowerCase())
        .filter(Boolean) as string[],
    )
    const limitDecision = getLimitUpgradeDecision(planId, 'customDomains', distinct.size + 1)
    if (limitDecision.allowed) return null

    return NextResponse.json(
      {
        error: `Your plan includes ${limit} custom domain${limit === 1 ? '' : 's'}. Upgrade to connect more.`,
        code: 'plan_limit_reached',
        limit,
        upgrade: limitDecision.upgradePlanId,
      },
      { status: 402 },
    )
  }

  // Status and removal stay open for diagnosis/cleanup after downgrade. Any path
  // that can activate routing (attach now, or status after CNAME proof below)
  // checks the owner feature and quota before the state-changing write.
  if (action === 'attach') {
    const allocationError = await customDomainAllocationError()
    if (allocationError) return allocationError
  }

  const providerConfigured = isVercelDomainConfigured()

  if (action === 'remove') {
    const { data: ownerDomainPages, error: ownerDomainPagesError } = await admin
      .from('pages')
      .select('id')
      .eq('owner_id', access.ownerId)
      .eq('custom_domain', domain)
      .returns<Array<{ id: string }>>()
    if (ownerDomainPagesError) {
      return NextResponse.json(
        { error: 'Could not confirm whether this domain is used by another listing.' },
        { status: 500 },
      )
    }

    const sharedDomainRetained = !claimInactive && (ownerDomainPages?.length ?? 0) > 1
    const shouldDetachProvider = !claimInactive && !sharedDomainRetained && providerConfigured
    // A stale page must never detach the provider configuration now controlled
    // by the canonical owner. A domain shared by another listing also remains
    // attached until the owner removes its final listing path.
    const removed = !shouldDetachProvider
      ? { ok: true }
      : await removeDomainFromProject(domain)
    if (!removed.ok) {
      return NextResponse.json(
        { error: removed.error || 'The managed domain could not be detached.' },
        { status: 502 },
      )
    }

    // Cleanup is intentionally available on every plan. Clear the saved host in
    // the same authoritative boundary that detaches it from the provider so a
    // downgraded client cannot strand a Vercel attachment by writing pages
    // directly. A provider 404 is treated as already detached.
    const { error: clearError } = await admin
      .from('pages')
      .update({ custom_domain: null, custom_domain_verified: null, domain_path: '/' })
      .eq('id', access.pageId)
      .eq('owner_id', access.ownerId)
      .eq('custom_domain', domain)
    if (clearError) {
      if (isEntitlementAllocationRetry(clearError)) return allocationRetryResponse()
      return NextResponse.json(
        { error: 'Domain detached, but the saved hostname could not be cleared.' },
        { status: 500 },
      )
    }
    return NextResponse.json({
      ok: true,
      removed: true,
      providerConfigured,
      providerDetached: shouldDetachProvider,
      sharedDomainRetained,
      staleClaimRemoved: claimInactive,
      claim: null,
    })
  }

  let ownershipVerified = Boolean(page.custom_domain_verified)
  let verifiedAt = page.custom_domain_verified
  let cnameConfigured = false

  let status: VercelDomainStatus = {
    attached: false,
    verified: false,
    configChecked: false,
    misconfigured: null,
    configuredBy: null,
    verificationMethod: 'unknown',
    requiredRecords: [],
    recommendedCNAME: [],
    recommendedIPv4: [],
  }

  if (providerConfigured) {
    status = action === 'attach' ? await addDomainToProject(domain) : await getDomainStatus(domain)
  }

  if (status.verificationMethod === 'cname') {
    cnameConfigured = await hasExpectedCname(domain, NEXEZ_CNAME)
  }

  // For a subdomain, a healthy CNAME attachment is the ownership proof. Only a
  // fully checked provider response can persist verification; missing config
  // data or a provider error must never become a false-positive "Live" state.
  if (isCnameProviderProof(status, cnameConfigured) && !ownershipVerified) {
    const allocationError = await customDomainAllocationError()
    if (allocationError) return allocationError

    verifiedAt = new Date().toISOString()
    const { data: verifiedPage, error: verifyError } = await admin
      .from('pages')
      .update({ custom_domain_verified: verifiedAt })
      .eq('id', access.pageId)
      .eq('owner_id', access.ownerId)
      .eq('custom_domain', domain)
      .select('id')
      .maybeSingle<{ id: string }>()

    if (verifyError) {
      if (isEntitlementAllocationRetry(verifyError)) return allocationRetryResponse()
      if (verifyError.code === '23505' && /custom[- ]domain/i.test(verifyError.message)) {
        return NextResponse.json(
          {
            error: 'This domain is no longer reserved for this listing. Refresh before trying again.',
            code: 'custom_domain_claim_lost',
            claim: claim ? { ...claim, owned: false } : null,
          },
          { status: 409 },
        )
      }
      if (verifyError.code === '23514' || /custom[- ]domain limit/i.test(verifyError.message)) {
        return NextResponse.json(
          {
            error: 'Your custom-domain limit was reached while this domain was being verified. Refresh your plan and try again.',
            code: 'plan_limit_reached',
            upgrade: quotaRaceUpgrade,
          },
          { status: 402 },
        )
      }
      return NextResponse.json({ error: 'Domain routing is verified, but saving verification failed.' }, { status: 500 })
    }
    if (!verifiedPage) {
      return NextResponse.json(
        {
          error: 'This domain is no longer reserved for this listing. Refresh before trying again.',
          code: 'custom_domain_claim_lost',
          claim: claim ? { ...claim, owned: false } : null,
        },
        { status: 409 },
      )
    }

    await admin
      .from('page_secrets')
      .update({ domain_verification_token: null, updated_at: verifiedAt })
      .eq('page_id', access.pageId)
      .eq('owner_id', access.ownerId)

    ownershipVerified = true
    claim = claim ? { ...claim, verifiedAt, owned: true } : claim
  }

  const legacyTxtBlocksCname =
    status.verificationMethod === 'cname' && !isCnameProviderProof(status, cnameConfigured)
      ? await hasLegacyCustomDomainTxt(domain)
      : false

  const derived = deriveDomainState({
    hasDomain: true,
    ownershipVerified,
    providerConfigured,
    attached: status.attached,
    providerVerified: status.verified,
    providerConfigChecked: status.configChecked,
    verificationMethod: status.verificationMethod,
    configuredBy: status.configuredBy,
    cnameConfigured,
    misconfigured: status.misconfigured,
    errored: Boolean(status.error && status.error !== 'not_configured'),
  })

  return NextResponse.json({
    ok: true,
    domain,
    providerConfigured,
    ownershipVerified,
    verifiedAt,
    claim,
    verificationMethod: status.verificationMethod,
    legacyTxtBlocksCname,
    provider: providerConfigured ? { ...status, cnameConfigured } : null,
    state: derived.state,
    label: derived.label,
    detail: derived.detail,
    requiredRecords: status.requiredRecords,
    routingRecords:
      status.verificationMethod === 'cname'
        ? [{ type: 'CNAME', name: domain, value: NEXEZ_CNAME }]
        : status.verificationMethod === 'txt'
          ? status.recommendedIPv4.map((value) => ({ type: 'A', name: domain, value }))
          : [],
  })
}
