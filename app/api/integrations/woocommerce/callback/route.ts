import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../../../utils/supabase/admin'
import { enforceRateLimit } from '../../../../../lib/rate-limit'
import { syncPageIntegration } from '../../../../../lib/server/integration-sync'
import { ownerAllows } from '../../../../../lib/server/plan'
import {
  merchantConnectorStorageConfigured,
  readConnectorState,
  resolvedWooCommerceSiteError,
  resolveWooCommerceSiteOrigin,
  upsertMerchantConnectorConnection,
} from '../../../../../lib/server/merchant-connectors'

async function callbackBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return await request.json().catch(() => ({})) as Record<string, unknown>
  const form = await request.formData().catch(() => null)
  return form ? Object.fromEntries(form.entries()) : {}
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'woocommerce-auth-callback', 30, 60_000)
  if (limited) return limited
  if (!merchantConnectorStorageConfigured()) {
    return NextResponse.json({ error: 'Integration credential storage is not configured.' }, { status: 503 })
  }
  const body = await callbackBody(request)
  const state = readConnectorState(String(body.user_id || ''), 'woocommerce')
  if (!state?.siteUrl) return NextResponse.json({ error: 'Invalid or expired authorization state.' }, { status: 401 })
  const siteUrl = resolveWooCommerceSiteOrigin(state.siteUrl)
  if (!siteUrl || await resolvedWooCommerceSiteError(siteUrl)) {
    return NextResponse.json({ error: 'The WooCommerce store URL is not safe to connect.' }, { status: 400 })
  }
  const consumerKey = String(body.consumer_key || '').trim()
  const consumerSecret = String(body.consumer_secret || '').trim()
  const permissions = String(body.key_permissions || '').trim()
  if (!consumerKey || !consumerSecret || !permissions.includes('read')) {
    return NextResponse.json({ error: 'WooCommerce did not grant read access.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: page } = await admin
    .from('pages')
    .select('id,owner_id')
    .eq('id', state.pageId)
    .maybeSingle<{ id: string; owner_id: string | null }>()
  if (!page || page.owner_id !== state.ownerId) {
    return NextResponse.json({ error: 'The listing connection changed. Start again.' }, { status: 409 })
  }
  if (!(await ownerAllows(admin, state.ownerId, 'integrations'))) {
    return NextResponse.json({ error: 'Live integrations require Pro or higher.' }, { status: 402 })
  }
  const saved = await upsertMerchantConnectorConnection(admin, {
    pageId: state.pageId,
    ownerId: state.ownerId,
    provider: 'woocommerce',
    credential: { siteUrl, consumerKey, consumerSecret },
    externalAccountId: siteUrl,
    scopes: ['read'],
  })
  if (!saved) return NextResponse.json({ error: 'Could not save the WooCommerce connection.' }, { status: 503 })
  const synced = await syncPageIntegration(admin, 'woocommerce', state.pageId)
  return NextResponse.json({ ok: true, synced: synced.ok })
}
