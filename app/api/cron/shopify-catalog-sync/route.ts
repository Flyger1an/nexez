import { NextResponse } from 'next/server'
import { processPendingShopifyCatalogSyncs } from '../../../../lib/server/shopify-catalog-sync'
import { integrationCredentialsConfigured } from '../../../../lib/server/page-integration-credentials'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

export const maxDuration = 60

/** Retryable Shopify catalog reconciliation. Product webhooks only enqueue;
 * this bounded worker performs the slower GraphQL import away from Shopify's
 * delivery timeout. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, error: 'cron_secret_not_configured' }, { status: 503 })
  }
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ ok: false, error: 'service_role_required' }, { status: 503 })
  }
  if (!integrationCredentialsConfigured()) {
    return NextResponse.json({ ok: false, error: 'credential_storage_not_configured' }, { status: 503 })
  }

  try {
    const result = await processPendingShopifyCatalogSyncs(createAdminClient(), 4)
    return NextResponse.json({ ok: true, ...result, ran_at: new Date().toISOString() })
  } catch (error) {
    console.error('[shopify-catalog-sync] worker failed', error)
    return NextResponse.json({ ok: false, error: 'shopify_catalog_sync_failed' }, { status: 500 })
  }
}
