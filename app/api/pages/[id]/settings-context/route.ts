import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../../utils/supabase/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../../utils/supabase/admin'
import { resolvePageAccess } from '../../../../../lib/server/page-access'
import { getOwnerPlanId } from '../../../../../lib/server/plan'
import { getPageIntegrationConnections } from '../../../../../lib/server/integration-connections'
import { enforceRateLimit } from '../../../../../lib/rate-limit'

/**
 * Settings context for the page editor's Settings screen, collaborator-aware. Returns
 * the EFFECTIVE plan (the page OWNER's, so an editor sees the owner's entitlements not
 * their own) + the role + the owner-only page_secrets the UI needs (domain token,
 * calendly secret, outbound webhooks) - all behind resolvePageAccess(requireEditor),
 * read via the service-role client (an editor can't read page_secrets under RLS).
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
  if (!hasSupabaseAdminEnv()) return NextResponse.json({ error: 'Not available.' }, { status: 503 })

  // Settings is an editing surface → editors only (viewers are rejected).
  const access = await resolvePageAccess({ pageId, userId: user.id, userEmail: user.email, userEmailConfirmedAt: user.email_confirmed_at, requireEditor: true })
  if (!access) return NextResponse.json({ error: 'You do not have edit access to this page.' }, { status: 403 })

  const admin = createAdminClient()
  const [plan, { data: secrets }, integrations] = await Promise.all([
    getOwnerPlanId(admin, access.ownerId),
    admin
      .from('page_secrets')
      // calendly_pat_encrypted is selected ONLY to derive a boolean — its value
      // never leaves the server.
      .select('calendly_webhook_secret, outbound_webhooks, domain_verification_token, calendly_pat_encrypted')
      .eq('page_id', access.pageId)
      .maybeSingle<{ calendly_webhook_secret: string | null; outbound_webhooks: unknown; domain_verification_token: string | null; calendly_pat_encrypted: string | null }>(),
    // Unified per-provider connection state for the Integrations panel (booleans
    // + timestamps only — never a credential value).
    getPageIntegrationConnections(access.pageId, access.ownerId),
  ])

  return NextResponse.json({
    role: access.role,
    ownerId: access.ownerId,
    plan, // the OWNER's effective plan - drives the UI gates for owner + editor alike
    integrations,
    secrets: {
      calendly_webhook_secret: secrets?.calendly_webhook_secret ?? null,
      outbound_webhooks: secrets?.outbound_webhooks ?? null,
      domain_verification_token: secrets?.domain_verification_token ?? null,
      // Boolean only — the encrypted PAT is never returned to the client.
      calendly_connected: Boolean(secrets?.calendly_pat_encrypted),
    },
  })
}
