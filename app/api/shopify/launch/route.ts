import { NextResponse } from 'next/server'
import { shopifyConfigured } from '../../../../lib/server/shopify'
import { resolveShopDomain } from '../../../../lib/server/integration-importers'
import { appUrl } from '../../../../lib/site'

/**
 * The app launch URL (set as the app's `application_url`). Shopify opens this
 * when a merchant clicks the app in their admin, carrying `?shop=<store>`. We
 * route straight into the OAuth→link flow so opening the app lands the merchant
 * on the linking page (which creates/refreshes the install record + pending
 * cookie) instead of the bare dashboard. INERT (404) until configured.
 */
export async function GET(request: Request) {
  if (!shopifyConfigured()) {
    return NextResponse.json({ error: 'Shopify app is not configured.' }, { status: 404 })
  }
  const shop = resolveShopDomain(new URL(request.url).searchParams.get('shop') || '')
  // No/invalid shop context (opened directly, not from Shopify) → the dashboard.
  if (!shop) {
    return NextResponse.redirect(appUrl('/dashboard'), 302)
  }
  return NextResponse.redirect(appUrl(`/api/shopify/auth?shop=${encodeURIComponent(shop)}`), 302)
}
