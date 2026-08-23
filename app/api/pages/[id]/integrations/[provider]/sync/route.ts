import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../../../../utils/supabase/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../../../../utils/supabase/admin'
import { gateIntegrationImport } from '../../../../../../../lib/server/integration-importers'
import { syncPageIntegration, isSyncProvider } from '../../../../../../../lib/server/integration-sync'
import { resolvePageAccess } from '../../../../../../../lib/server/page-access'
import {
  activeShopifyInstallMapping,
  getInstallByPage,
  getShopifyInstallCredentialsByShop,
} from '../../../../../../../lib/server/shopify-install'
import { enforceRateLimit } from '../../../../../../../lib/rate-limit'

/**
 * One per-listing "Sync now" for every stored-credential integration. Premium
 * token connections are Pro-gated. An active Shopify App Store OAuth install is
 * the explicit all-plan exception: authorize the page, prove the install belongs
 * to that page owner, then pass its exact credentials so this route can never
 * fall back to manually supplied Shopify credentials. Dormant without the
 * service role / INTEGRATION_SECRET_KEY; 400 when a premium provider is not
 * connected and 409 when an installed Shopify app must be reconnected.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string; provider: string }> }) {
  const limited = await enforceRateLimit(request, 'integration-sync', 10, 60_000)
  if (limited) return limited

  const { id: pageId, provider } = await ctx.params
  if (!isSyncProvider(provider)) {
    return NextResponse.json({ error: 'Unsupported integration.' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  if (provider === 'shopify' && hasSupabaseAdminEnv()) {
    const access = await resolvePageAccess({
      pageId,
      userId: user.id,
      userEmail: user.email,
      userEmailConfirmedAt: user.email_confirmed_at,
      requireEditor: true,
    })
    if (!access) {
      return NextResponse.json({ error: 'You do not have edit access to this page.' }, { status: 403 })
    }

    const admin = createAdminClient()
    let install
    try {
      install = await getInstallByPage(admin, access.pageId)
    } catch {
      return NextResponse.json({ error: 'Could not verify the Shopify app connection.' }, { status: 503 })
    }
    if (install) {
      const mapping = activeShopifyInstallMapping(install)
      if (!mapping || mapping.ownerId !== access.ownerId || mapping.pageId !== access.pageId) {
        return NextResponse.json({ error: 'Reconnect the Shopify app to this listing before syncing.' }, { status: 409 })
      }
      const credentials = await getShopifyInstallCredentialsByShop(admin, mapping.shop)
      if (!credentials) {
        return NextResponse.json({ error: 'Reconnect the Shopify app to resume catalog sync.' }, { status: 409 })
      }
      const installedResult = await syncPageIntegration(admin, 'shopify', access.pageId, {
        shopifyCredentials: credentials,
        shopifyMapping: mapping,
        clearShopifyCatalogSyncState: true,
      })
      if (!installedResult.ok) {
        return NextResponse.json({ error: installedResult.error }, { status: installedResult.status })
      }
      return NextResponse.json({
        ok: true,
        provider: installedResult.provider,
        imported: installedResult.imported,
        windows: installedResult.windows,
        availability_synced: installedResult.availabilitySynced,
        note: installedResult.note,
      })
    }
  } else if (provider === 'shopify') {
    return NextResponse.json({ error: 'Server is not configured for this action.' }, { status: 503 })
  }

  // No active Shopify OAuth install (or a non-Shopify provider): this is the
  // premium stored-credential path and must remain Pro-gated.
  const gate = await gateIntegrationImport({
    supabase,
    user,
    pageId,
    proMessage: 'Syncing integrations is a Pro feature. Upgrade to pull live catalogs + availability.',
  })
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const admin = createAdminClient()
  const result = await syncPageIntegration(admin, provider, pageId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({
    ok: true,
    provider: result.provider,
    imported: result.imported,
    windows: result.windows,
    availability_synced: result.availabilitySynced,
    note: result.note,
  })
}
