import { NextResponse } from 'next/server'
import { shopifyConfigured, verifyShopifyAppProxySignature } from '../../../../lib/server/shopify'
import { getInstallByShop } from '../../../../lib/server/shopify-install'
import { resolveShopDomain } from '../../../../lib/server/integration-importers'
import { agentRuntimeUrl } from '../../../../lib/site'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

// The only artifacts an App Proxy request may fetch (allowlist → no open proxy).
const ALLOWED_ARTIFACTS = new Set(['agent.json', 'llms.txt', 'openapi.json', 'mcp.json', 'embed.json'])

/**
 * Shopify App Proxy handler: lets a storefront serve its live Nexez agent
 * artifacts under the shop's own domain (the Shopify equivalent of the WordPress
 * request-interception, since a theme extension can't). Verifies the App-Proxy
 * signature, resolves shop → linked Nexez listing, and redirects to the live
 * artifact on the runtime host. INERT (404) until SHOPIFY_API_KEY/SECRET are set.
 */
export async function GET(request: Request) {
  if (!shopifyConfigured()) {
    return NextResponse.json({ error: 'Shopify app is not configured.' }, { status: 404 })
  }
  const params = new URL(request.url).searchParams
  if (!verifyShopifyAppProxySignature(params)) {
    return NextResponse.json({ error: 'Invalid App Proxy signature.' }, { status: 401 })
  }

  const artifact = (params.get('artifact') || 'agent.json').replace(/^\/+/, '')
  if (!ALLOWED_ARTIFACTS.has(artifact)) {
    return NextResponse.json({ error: 'Unknown artifact.' }, { status: 404 })
  }

  const shop = resolveShopDomain(params.get('shop') || '')
  if (!shop || !hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }
  const admin = createAdminClient()
  const install = await getInstallByShop(admin, shop)
  if (!install?.page_id) {
    return NextResponse.json({ error: 'This shop is not linked to a Nexez listing.' }, { status: 404 })
  }
  const { data } = await admin.from('pages').select('slug').eq('id', install.page_id).maybeSingle()
  const slug = (data as { slug?: string } | null)?.slug
  if (!slug) {
    return NextResponse.json({ error: 'Linked listing not found.' }, { status: 404 })
  }

  return NextResponse.redirect(agentRuntimeUrl(`/${slug}/${artifact}`), 302)
}
