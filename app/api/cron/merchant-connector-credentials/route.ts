import { NextResponse } from 'next/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import {
  merchantConnectorStorageConfigured,
  refreshDueMerchantConnectorCredentials,
} from '../../../../lib/server/merchant-connectors'
import { captureError, captureEvent } from '../../../../lib/observability'

export const maxDuration = 60

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, error: 'cron_secret_not_configured' }, { status: 503 })
  }
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasSupabaseAdminEnv() || !merchantConnectorStorageConfigured()) {
    return NextResponse.json({ ok: false, error: 'credential_storage_not_configured' }, { status: 503 })
  }

  const result = await refreshDueMerchantConnectorCredentials(createAdminClient())
  captureEvent('cron.merchant_connector_credentials', result)
  if (result.failed > 0) {
    captureError(new Error('Merchant connector credential refresh failed.'), {
      route: '/api/cron/merchant-connector-credentials',
      ...result,
    })
  }
  return NextResponse.json(
    { ok: result.failed === 0, ...result, ran_at: new Date().toISOString() },
    { status: result.failed === 0 ? 200 : 502 },
  )
}
