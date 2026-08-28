import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../../utils/supabase/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../../utils/supabase/admin'
import { resolvePageAccess } from '../../../../../lib/server/page-access'
import { getOwnerPlanId } from '../../../../../lib/server/plan'
import { getPageIntegrationConnections } from '../../../../../lib/server/integration-connections'
import { agenticProgramFlags, resolveOwnerSettlementReadiness } from '../../../../../lib/server/agentic-commerce-eligibility'
import { enforceRateLimit } from '../../../../../lib/rate-limit'
import { outboundWebhooksForClient } from '../../../../../lib/server/outbound-webhook-config'
import { getCustomDomainClaim } from '../../../../../lib/server/custom-domain-claim'

/**
 * Settings context for the page editor's Settings screen, collaborator-aware. Returns
 * the EFFECTIVE plan (the page OWNER's, so an editor sees the owner's entitlements not
 * their own) + the role + the owner-only page_secrets the UI needs (domain token,
 * calendly secret, outbound webhooks). Collaborator access is resolved with the
 * service-role client. In a local owner session without that credential, the route
 * safely degrades through owner RLS and marks integration status as unavailable.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(request, 'settings-context', 40, 60_000)
  if (limited) return limited

  const { id: pageId } = await ctx.params
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  if (!hasSupabaseAdminEnv()) {
    // Safe local-development fallback: the authenticated client can read only rows
    // granted by RLS. Re-check owner_id explicitly so an editor/viewer can never use
    // this reduced path to obtain owner-only page_secrets. Collaborators continue to
    // fail closed until the service-role resolver is available.
    const { data: ownedPage } = await supabase
      .from('pages')
      .select('id, owner_id')
      .eq('id', pageId)
      .maybeSingle<{ id: string; owner_id: string | null }>()
    if (!ownedPage || ownedPage.owner_id !== user.id) {
      return NextResponse.json({ error: 'You do not have edit access to this listing.' }, { status: 403 })
    }

    const [plan, { data: secrets }] = await Promise.all([
      getOwnerPlanId(supabase, user.id),
      supabase
        .from('page_secrets')
        .select('calendly_webhook_secret, outbound_webhooks, domain_verification_token, website_verification_token')
        .eq('page_id', pageId)
        .maybeSingle<{
          calendly_webhook_secret: string | null
          outbound_webhooks: unknown
          domain_verification_token: string | null
          website_verification_token: string | null
        }>(),
    ])

    return NextResponse.json({
      role: 'owner',
      ownerId: user.id,
      plan,
      contextLimited: true,
      customDomainClaim: null,
      customDomainClaimAvailable: false,
      integrations: [],
      secrets: {
        calendly_webhook_secret: secrets?.calendly_webhook_secret ?? null,
        outbound_webhooks: outboundWebhooksForClient(secrets?.outbound_webhooks),
        domain_verification_token: secrets?.domain_verification_token ?? null,
        website_verification_token: secrets?.website_verification_token ?? null,
        // This boolean depends on a service-role-only encrypted column. Unknown
        // must not be reported as connected in the limited context.
        calendly_connected: false,
      },
    })
  }

  // Settings is an editing surface → editors only (viewers are rejected).
  const access = await resolvePageAccess({ pageId, userId: user.id, userEmail: user.email, userEmailConfirmedAt: user.email_confirmed_at, requireEditor: true })
  if (!access) return NextResponse.json({ error: 'You do not have edit access to this listing.' }, { status: 403 })

  const admin = createAdminClient()
  const [plan, { data: secrets }, integrations, settlementReadiness, claimResult] = await Promise.all([
    getOwnerPlanId(admin, access.ownerId),
    admin
      .from('page_secrets')
      // calendly_pat_encrypted is selected ONLY to derive a boolean - its value
      // never leaves the server.
      .select('calendly_webhook_secret, outbound_webhooks, domain_verification_token, website_verification_token, calendly_pat_encrypted')
      .eq('page_id', access.pageId)
      .maybeSingle<{ calendly_webhook_secret: string | null; outbound_webhooks: unknown; domain_verification_token: string | null; website_verification_token: string | null; calendly_pat_encrypted: string | null }>(),
    // Unified per-provider connection state for the Integrations panel (booleans
    // + timestamps only - never a credential value).
    getPageIntegrationConnections(access.pageId, access.ownerId),
    // Settlement input for the agentic-commerce (ChatGPT/Google) status card - the client
    // combines these with the listing's published state via agenticCommerceStatus().
    resolveOwnerSettlementReadiness(admin, access.ownerId),
    getCustomDomainClaim(admin, access.pageId),
  ])
  const calendlyConnected = integrations.some((connection) => (
    connection.provider === 'calendly' && connection.connected
  ))

  return NextResponse.json({
    role: access.role,
    ownerId: access.ownerId,
    plan, // the OWNER's effective plan - drives the UI gates for owner + editor alike
    customDomainClaim: claimResult.error ? null : claimResult.claim,
    customDomainClaimAvailable: !claimResult.error,
    integrations,
    // The inputs the "Sell through ChatGPT & Google" card reads: Connect readiness
    // and each surface's program flag (ChatGPT/Google enroll
    // independently, so they're reported separately - never collapsed to one boolean).
    agenticCommerce: {
      connectReady: settlementReadiness.connectReady,
      ...agenticProgramFlags(),
    },
    secrets: {
      calendly_webhook_secret: secrets?.calendly_webhook_secret ?? null,
      outbound_webhooks: outboundWebhooksForClient(secrets?.outbound_webhooks),
      domain_verification_token: secrets?.domain_verification_token ?? null,
      website_verification_token: secrets?.website_verification_token ?? null,
      // Boolean only. The unified state covers managed OAuth and legacy personal
      // tokens without returning either encrypted credential to the client.
      calendly_connected: calendlyConnected,
    },
  })
}
