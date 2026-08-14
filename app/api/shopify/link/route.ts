import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { readPendingShop, shopifyConfigured } from '../../../../lib/server/shopify'
import {
  getInstallByShop,
  getShopifyInstallCredentialsByShop,
  markShopifySynced,
  removeShopifyCatalogFromPage,
} from '../../../../lib/server/shopify-install'
import { syncPageIntegration } from '../../../../lib/server/integration-sync'
import { resolvePageAccess } from '../../../../lib/server/page-access'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { createClient } from '../../../../utils/supabase/server'
import { requirePageAccess } from '../../../../lib/server/require-page-access'

/**
 * Link the just-installed Shopify shop to one of the signed-in owner's listings.
 * Authorization is the intersection of two proofs:
 *   - a valid signed `shopify_pending_shop` cookie (the OAuth callback set it →
 *     this browser proved Shopify-admin control of the shop), and
 *   - resolvePageAccess (the caller has edit access to the chosen listing).
 * Then the service-role client sets owner_id + page_id on shopify_installs.
 * INERT (404) until the Shopify app is configured.
 */
export async function POST(request: Request) {
  if (!shopifyConfigured()) {
    return NextResponse.json({ error: 'Shopify app is not configured.' }, { status: 404 })
  }
  const limited = await enforceRateLimit(request, 'shopify-link', 20, 60_000)
  if (limited) return limited

  const jar = await cookies()
  const supabase = createClient(jar)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const shop = readPendingShop(jar.get('shopify_pending_shop')?.value)
  if (!shop) {
    return NextResponse.json({ error: 'No pending Shopify connection. Reinstall the app from Shopify.' }, { status: 400 })
  }

  // The pending-shop cookie and the listing pick are read inside the resolver so
  // their 400s keep firing before authorization, exactly as before.
  const gate = await requirePageAccess({
    pageId: async () => {
      const body = (await request.json().catch(() => ({}))) as { pageId?: unknown }
      const requested = typeof body.pageId === 'string' ? body.pageId : ''
      if (!requested) return NextResponse.json({ error: 'Pick a listing to connect.' }, { status: 400 })
      return requested
    },
    unavailableMessage: 'Not available.',
    denyMessage: 'You do not have access to that listing.',
  })
  if (!gate.ok) return gate.response
  const { access, admin } = gate
  const pageId = access.pageId
  const install = await getInstallByShop(admin, shop)
  if (!install) return NextResponse.json({ error: 'Shop not found. Reinstall the app.' }, { status: 404 })

  const { data: conflictingInstall, error: conflictError } = await admin
    .from('shopify_installs')
    .select('shop_domain')
    .eq('page_id', pageId)
    .is('uninstalled_at', null)
    .neq('shop_domain', shop)
    .limit(1)
    .maybeSingle<{ shop_domain: string }>()
  if (conflictError) return NextResponse.json({ error: 'Could not verify the listing connection.' }, { status: 500 })
  if (conflictingInstall) {
    return NextResponse.json(
      { error: 'That listing is already connected to another Shopify store. Choose a different listing.' },
      { status: 409 },
    )
  }

  if (install.page_id && install.page_id !== pageId) {
    try {
      await removeShopifyCatalogFromPage(admin, install.page_id, shop)
    } catch (cleanupError) {
      console.error('[shopify-link] previous listing cleanup failed', {
        shop,
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      })
      return NextResponse.json(
        { error: 'Could not move this store from its previous listing. Try again.' },
        { status: 503 },
      )
    }
  }

  const linkedAt = new Date().toISOString()
  const { error } = await admin
    .from('shopify_installs')
    .update({
      owner_id: access.ownerId,
      page_id: pageId,
      linked_at: linkedAt,
      last_synced_at: null,
      updated_at: linkedAt,
    })
    .eq('shop_domain', shop)
    .is('uninstalled_at', null)
  if (error) {
    const status = (error as { code?: string }).code === '23505' ? 409 : 500
    const message = status === 409
      ? 'That listing is already connected to another Shopify store. Choose a different listing.'
      : 'Could not link the shop.'
    return NextResponse.json({ error: message }, { status })
  }

  let sync:
    | { status: 'synced'; imported: number; syncedAt: string; note: string | null }
    | { status: 'attention'; error: string }
  try {
    const credentials = await getShopifyInstallCredentialsByShop(admin, shop)
    if (!credentials) {
      sync = { status: 'attention', error: 'Reconnect the Shopify app to import the catalog.' }
    } else {
      const result = await syncPageIntegration(admin, 'shopify', pageId, {
        shopifyCredentials: credentials,
      })
      if (result.ok) {
        const syncedAt = new Date().toISOString()
        await markShopifySynced(admin, pageId, syncedAt, {
          shop,
          clearCatalogSyncState: true,
        })
        sync = {
          status: 'synced',
          imported: result.imported,
          syncedAt,
          note: result.note,
        }
      } else {
        sync = { status: 'attention', error: result.error }
      }
    }
  } catch (syncError) {
    console.error('[shopify-link] initial catalog sync failed', {
      shop,
      error: syncError instanceof Error ? syncError.message : String(syncError),
    })
    sync = {
      status: 'attention',
      error: 'The store is connected, but the first catalog sync needs another try.',
    }
  }

  jar.delete('shopify_pending_shop')
  return NextResponse.json({ ok: true, shop, pageId, sync })
}
