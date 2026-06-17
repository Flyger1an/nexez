import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../../utils/supabase/server'
import { createAdminClient } from '../../../../../utils/supabase/admin'
import { ownerAllows } from '../../../../../lib/server/plan'
import { resolveFeatureOwner } from '../../../../../lib/server/page-access'

/**
 * Shopify Integration for Nexez (Phase 3)
 *
 * Supports two modes:
 * 1. Public catalog (no token) - uses the enhanced general importer
 * 2. Authenticated (Admin API token) - full private catalog access
 *
 * This route focuses on authenticated import using Shopify Admin API.
 */

type ShopifyImportRequest = {
  shop: string           // e.g. "yourstore.myshopify.com"
  accessToken: string    // Admin API token (shpat_...)
  limit?: number
  pageId?: string        // when importing INTO an existing page (collaboration)
}

/**
 * Resolve a Shopify store to a strictly-validated *.myshopify.com host. The old
 * `shop.includes('.myshopify.com')` substring check let an attacker point the
 * Admin-API call (carrying the caller's X-Shopify-Access-Token) at any host —
 * e.g. "evil.com/x#.myshopify.com" — turning this into an unauthenticated SSRF +
 * credential relay (red-team gauntlet finding). Pin the authority to a real
 * Shopify subdomain before building the URL.
 */
function resolveShopDomain(shop: string): string | null {
  let host = (shop || '').trim().toLowerCase()
  if (host.includes('://')) {
    try { host = new URL(host).hostname } catch { return null }
  }
  host = host.replace(/[/?#].*$/, '') // defensive: strip any path/query/fragment
  if (!host.includes('.')) host = `${host}.myshopify.com`
  return /^[a-z0-9][a-z0-9-]{0,59}\.myshopify\.com$/.test(host) ? host : null
}

export async function POST(request: Request) {
  // Require an authenticated session — this route fetches a private catalog with a
  // caller-supplied admin token and must not be anonymously abusable.
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  }

  let body: ShopifyImportRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Live catalog sync is a Pro (`integrations`) capability, gated on the EFFECTIVE
  // OWNER: a `pageId` lets an editor-collaborator import into the owner's page (gate on
  // the owner's plan); the page-less create flow self-gates. Free/Launch owners build
  // manually or via CSV (free).
  const access = await resolveFeatureOwner({
    pageId: body.pageId,
    userId: user.id,
    userEmail: user.email,
    userEmailConfirmedAt: user.email_confirmed_at,
  })
  if (!access.ok) {
    return NextResponse.json(
      { error: access.status === 503 ? 'Server is not configured for this action.' : 'You do not have edit access to this page.' },
      { status: access.status },
    )
  }
  if (!(await ownerAllows(access.scoped ? createAdminClient() : supabase, access.ownerId, 'integrations'))) {
    return NextResponse.json(
      { error: 'Connecting Shopify is a Pro feature. Upgrade to import your catalog, or add offers manually / upload a CSV (free).' },
      { status: 402 },
    )
  }

  const { shop, accessToken, limit = 50 } = body

  if (!shop || !accessToken) {
    return NextResponse.json({ error: 'Shop domain and access token are required' }, { status: 400 })
  }

  const shopDomain = resolveShopDomain(shop)
  if (!shopDomain) {
    return NextResponse.json({ error: 'Invalid Shopify store domain (expected your-store.myshopify.com).' }, { status: 400 })
  }
  const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 250)
  const apiVersion = '2024-01'

  try {
    const url = `https://${shopDomain}/admin/api/${apiVersion}/products.json?limit=${safeLimit}&fields=id,title,body_html,handle,product_type,variants,images`

    const res = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      // Do NOT reflect the upstream response body — it was a read-SSRF exfiltration
      // channel. Surface only Shopify's status code.
      return NextResponse.json({
        error: 'Failed to fetch from Shopify',
        status: res.status,
      }, { status: 502 })
    }

    const data = await res.json()
    const products = data.products || []

    const structuredOffers = products.map((product: any) => {
      const firstVariant = product.variants?.[0]
      const price = firstVariant?.price ? `$${parseFloat(firstVariant.price).toFixed(0)}` : 'See options'
      
      const description = product.body_html 
        ? product.body_html.replace(/<[^>]+>/g, ' ').trim().substring(0, 280)
        : (product.product_type || 'Shopify product')

      const url = `https://${shopDomain}/products/${product.handle}`

      // Handle variants as tiers when there are multiple
      let tiers = undefined
      if (product.variants && product.variants.length > 1) {
        tiers = product.variants.slice(0, 5).map((v: any) => ({
          name: v.title || v.option1 || 'Option',
          price: v.price ? `$${parseFloat(v.price).toFixed(0)}` : 'Custom',
        }))
      }

      return {
        name: product.title,
        description,
        price,
        url,
        source: 'shopify',
        confidence: 0.92,
        tiers,
      }
    })

    return NextResponse.json({
      ok: true,
      count: structuredOffers.length,
      structuredOffers,
      message: `Imported ${structuredOffers.length} products from Shopify.`,
    })

  } catch (error: any) {
    console.error('Shopify import error:', error)
    return NextResponse.json({ error: 'Shopify import failed' }, { status: 500 })
  }
}
