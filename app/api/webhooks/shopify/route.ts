import { NextResponse } from 'next/server'
import { shopifyConfigured, verifyShopifyWebhookHmac } from '../../../../lib/server/shopify'
import { markUninstalled, redactShop } from '../../../../lib/server/shopify-install'
import { isShopifyCatalogTopic, queueShopifyCatalogSync } from '../../../../lib/server/shopify-catalog-sync'
import { resolveShopDomain } from '../../../../lib/server/integration-importers'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

/**
 * Shopify webhooks (App-Store-mandatory): app/uninstalled + the three GDPR
 * topics. Verifies the raw-body HMAC before doing anything; INERT (404) until
 * SHOPIFY_API_KEY/SECRET are set, 401 on a bad/absent signature.
 *
 * Nexez stores NO Shopify customer PII (it only reads the merchant's product
 * catalog), so customers/data_request + customers/redact are acknowledge-only.
 * app/uninstalled + shop/redact wipe the stored offline token.
 */
export async function POST(request: Request) {
  if (!shopifyConfigured()) {
    return NextResponse.json({ error: 'Shopify app is not configured.' }, { status: 404 })
  }
  const raw = await request.text()
  if (!verifyShopifyWebhookHmac(raw, request.headers.get('x-shopify-hmac-sha256'))) {
    return NextResponse.json({ error: 'HMAC verification failed.' }, { status: 401 })
  }

  const topic = request.headers.get('x-shopify-topic') || ''
  const shop = resolveShopDomain(request.headers.get('x-shopify-shop-domain') || '')
  const isLifecycleTopic = topic === 'app/uninstalled' || topic === 'shop/redact'
  const isCatalogTopic = isShopifyCatalogTopic(topic)
  let queued = false

  if ((isLifecycleTopic || isCatalogTopic) && shop) {
    if (!hasSupabaseAdminEnv()) {
      return NextResponse.json({ error: 'Shopify install storage is unavailable.' }, { status: 503 })
    }
    try {
      const admin = createAdminClient()
      if (topic === 'shop/redact') await redactShop(admin, shop)
      else if (topic === 'app/uninstalled') await markUninstalled(admin, shop, new Date().toISOString())
      else if (isCatalogTopic) queued = await queueShopifyCatalogSync(admin, shop, topic)
    } catch {
      // A 5xx asks Shopify to retry. Returning 200 here would silently retain a
      // live token or shop record after a transient database failure.
      return NextResponse.json({ error: 'Could not process the Shopify lifecycle event.' }, { status: 503 })
    }
  }
  // customers/data_request + customers/redact: no Shopify customer PII is held → ack.
  return NextResponse.json({ ok: true, ...(isCatalogTopic ? { queued } : {}) })
}
