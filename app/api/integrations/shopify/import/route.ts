import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../../utils/supabase/server'
import { gateIntegrationImport, importShopifyOffers } from '../../../../../lib/server/integration-importers'

/**
 * Shopify Integration for Nexez — authenticated Admin API catalog import.
 * The domain-pinning fetch + parse lives in lib/server/integration-importers
 * (shared with the interview's /ingest); this route is auth + Pro gate + shaping.
 */
type ShopifyImportRequest = {
  shop: string           // e.g. "yourstore.myshopify.com"
  accessToken: string    // Admin API token (shpat_...)
  limit?: number
  pageId?: string        // when importing INTO an existing page (collaboration)
}

export async function POST(request: Request) {
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

  const gate = await gateIntegrationImport({
    supabase,
    user,
    pageId: body.pageId,
    proMessage: 'Importing with manually supplied Shopify Admin credentials is a Pro feature. The installed Shopify app remains available on every plan.',
  })
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  if (!body.shop || !body.accessToken) {
    return NextResponse.json({ error: 'Shop domain and access token are required' }, { status: 400 })
  }

  const result = await importShopifyOffers({ shop: body.shop, accessToken: body.accessToken, limit: body.limit })
  if (!result.ok) {
    return NextResponse.json(
      result.upstreamStatus != null ? { error: result.error, status: result.upstreamStatus } : { error: result.error },
      { status: result.status },
    )
  }
  return NextResponse.json({
    ok: true,
    count: result.offers.length,
    structuredOffers: result.offers,
    message: result.note,
  })
}
