import { NextResponse } from 'next/server'
import { enforceRateLimit } from '../../../../../lib/rate-limit'
import { appUrl } from '../../../../../lib/site'
import { shopifyConfigured, verifyShopifySessionToken } from '../../../../../lib/server/shopify'
import { getInstallByShop, issueShopifyLinkToken } from '../../../../../lib/server/shopify-install'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../../utils/supabase/admin'

function json(body: Record<string, unknown>, status = 200) {
  const response = NextResponse.json(body, { status })
  response.headers.set('cache-control', 'no-store')
  return response
}

/** Start the existing top-level account-link flow for an already-linked shop.
 * Shopify session auth proves store-admin access; Nexez auth and page access are
 * checked again before the selected listing is changed. */
export async function POST(request: Request) {
  if (!shopifyConfigured()) return json({ error: 'Shopify app is not configured.' }, 404)
  if (!hasSupabaseAdminEnv()) return json({ error: 'Shopify install storage is unavailable.' }, 503)

  const token = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || ''
  const session = verifyShopifySessionToken(token)
  if (!session) return json({ error: 'Invalid or expired Shopify session.' }, 401)

  const limited = await enforceRateLimit(request, `shopify-session-relink:${session.shop}`, 12, 60_000)
  if (limited) return limited

  const admin = createAdminClient()
  const install = await getInstallByShop(admin, session.shop)
  if (!install) return json({ error: 'Reconnect the Shopify app before changing its listing.' }, 409)

  try {
    const linkToken = await issueShopifyLinkToken(admin, session.shop)
    return json({
      ok: true,
      connectUrl: appUrl(`/api/shopify/claim?token=${encodeURIComponent(linkToken)}`),
    })
  } catch {
    return json({ error: 'Could not open the listing picker. Try again.' }, 503)
  }
}
