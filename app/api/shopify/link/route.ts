import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { readPendingShop, shopifyConfigured } from '../../../../lib/server/shopify'
import { getInstallByShop } from '../../../../lib/server/shopify-install'
import { resolvePageAccess } from '../../../../lib/server/page-access'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { createClient } from '../../../../utils/supabase/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

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
  if (!hasSupabaseAdminEnv()) return NextResponse.json({ error: 'Not available.' }, { status: 503 })

  const shop = readPendingShop(jar.get('shopify_pending_shop')?.value)
  if (!shop) {
    return NextResponse.json({ error: 'No pending Shopify connection. Reinstall the app from Shopify.' }, { status: 400 })
  }

  const body = (await request.json().catch(() => ({}))) as { pageId?: unknown }
  const pageId = typeof body.pageId === 'string' ? body.pageId : ''
  if (!pageId) return NextResponse.json({ error: 'Pick a listing to connect.' }, { status: 400 })

  const access = await resolvePageAccess({
    pageId,
    userId: user.id,
    userEmail: user.email,
    userEmailConfirmedAt: user.email_confirmed_at,
    requireEditor: true,
  })
  if (!access) return NextResponse.json({ error: 'You do not have access to that listing.' }, { status: 403 })

  const admin = createAdminClient()
  const install = await getInstallByShop(admin, shop)
  if (!install) return NextResponse.json({ error: 'Shop not found. Reinstall the app.' }, { status: 404 })

  const { error } = await admin
    .from('shopify_installs')
    .update({ owner_id: user.id, page_id: pageId })
    .eq('shop_domain', shop)
  if (error) return NextResponse.json({ error: 'Could not link the shop.' }, { status: 500 })

  jar.delete('shopify_pending_shop')
  return NextResponse.json({ ok: true, shop, pageId })
}
