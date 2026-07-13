import { NextResponse } from 'next/server'
import { enforceRateLimit } from '../../../../../lib/rate-limit'
import { ownerAllows } from '../../../../../lib/server/plan'
import { shopifyConfigured, verifyShopifySessionToken } from '../../../../../lib/server/shopify'
import {
  getInstallByShop,
  getShopifyInstallCredentialsByShop,
  markShopifySynced,
} from '../../../../../lib/server/shopify-install'
import { syncPageIntegration } from '../../../../../lib/server/integration-sync'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../../utils/supabase/admin'

function json(body: Record<string, unknown>, status = 200) {
  const response = NextResponse.json(body, { status })
  response.headers.set('cache-control', 'no-store')
  return response
}

/** Run an exact-shop catalog refresh from the embedded app. Session-token auth
 * means this works without a Nexez cookie inside Shopify's admin iframe. */
export async function POST(request: Request) {
  if (!shopifyConfigured()) return json({ error: 'Shopify app is not configured.' }, 404)
  if (!hasSupabaseAdminEnv()) return json({ error: 'Shopify install storage is unavailable.' }, 503)

  const token = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || ''
  const session = verifyShopifySessionToken(token)
  if (!session) return json({ error: 'Invalid or expired Shopify session.' }, 401)
  const limited = await enforceRateLimit(request, `shopify-session-sync:${session.shop}`, 6, 60_000)
  if (limited) return limited

  const admin = createAdminClient()
  const install = await getInstallByShop(admin, session.shop)
  if (!install?.owner_id || !install.page_id) {
    return json({ error: 'Connect this store to a Nexez listing before syncing.' }, 409)
  }
  if (!(await ownerAllows(admin, install.owner_id, 'integrations'))) {
    return json(
      {
        error: 'Catalog sync is not enabled for this Nexez account.',
        code: 'billing_required',
      },
      402,
    )
  }

  const credentials = await getShopifyInstallCredentialsByShop(admin, session.shop)
  if (!credentials) return json({ error: 'Reconnect the Shopify app to resume catalog sync.' }, 409)

  const result = await syncPageIntegration(admin, 'shopify', install.page_id, {
    shopifyCredentials: credentials,
  })
  if (!result.ok) return json({ error: result.error }, result.status)

  const syncedAt = new Date().toISOString()
  await markShopifySynced(admin, install.page_id, syncedAt, {
    shop: session.shop,
    clearCatalogSyncState: true,
  })
  return json({ ok: true, imported: result.imported, syncedAt, note: result.note ?? null })
}
