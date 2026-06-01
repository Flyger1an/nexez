import { NextResponse } from 'next/server'

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
}

export async function POST(request: Request) {
  let body: ShopifyImportRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { shop, accessToken, limit = 50 } = body

  if (!shop || !accessToken) {
    return NextResponse.json({ error: 'Shop domain and access token are required' }, { status: 400 })
  }

  // Normalize shop domain
  const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`
  const apiVersion = '2024-01'

  try {
    const url = `https://${shopDomain}/admin/api/${apiVersion}/products.json?limit=${limit}&fields=id,title,body_html,handle,product_type,variants,images`

    const res = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      const errorText = await res.text()
      return NextResponse.json({ 
        error: 'Failed to fetch from Shopify', 
        details: errorText 
      }, { status: 401 })
    }

    const data = await res.json()
    const products = data.products || []

    const structuredOffers = products.map((product: any) => {
      const firstVariant = product.variants?.[0]
      const price = firstVariant?.price ? `$${parseFloat(firstVariant.price).toFixed(0)}` : 'See options'
      
      let description = product.body_html 
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
    return NextResponse.json({ 
      error: 'Shopify import failed', 
      details: error.message 
    }, { status: 500 })
  }
}
