import { NextResponse } from 'next/server'
import { captureError, captureEvent } from '../../../../lib/observability'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

export const maxDuration = 60

const UNCONVERTED_RETENTION_DAYS = 90
const CONVERTED_RETENTION_DAYS = 365

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret && process.env.NODE_ENV === 'production') return false
  return !secret || request.headers.get('authorization') === `Bearer ${secret}`
}

/**
 * Remove contact-bearing scan rows after their operational and attribution value
 * expires. Address-wide suppression records are intentionally retained so deleting
 * a lead can never make a recipient eligible for scan email again.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  }

  const now = Date.now()
  const unconvertedCutoff = new Date(now - UNCONVERTED_RETENTION_DAYS * 86_400_000).toISOString()
  const convertedCutoff = new Date(now - CONVERTED_RETENTION_DAYS * 86_400_000).toISOString()
  const admin = createAdminClient()

  try {
    const [unconverted, converted] = await Promise.all([
      admin
        .from('scan_leads')
        .delete()
        .is('converted_owner_id', null)
        .lt('updated_at', unconvertedCutoff)
        .or('delivered_at.not.is.null,abandoned_at.not.is.null,unsubscribed_at.not.is.null')
        .select('id')
        .returns<{ id: string }[]>(),
      admin
        .from('scan_leads')
        .delete()
        .not('converted_owner_id', 'is', null)
        .lt('converted_at', convertedCutoff)
        .select('id')
        .returns<{ id: string }[]>(),
    ])

    if (unconverted.error || converted.error) {
      const error = unconverted.error || converted.error
      captureError(error, { route: 'cron-scan-retention' })
      return NextResponse.json({ ok: false, error: 'retention_failed' }, { status: 503 })
    }

    const removedUnconverted = unconverted.data?.length ?? 0
    const removedConverted = converted.data?.length ?? 0
    captureEvent('scan.retention', { removedUnconverted, removedConverted })
    return NextResponse.json({
      ok: true,
      removedUnconverted,
      removedConverted,
      retainedSuppressions: true,
      ranAt: new Date(now).toISOString(),
    })
  } catch (error) {
    captureError(error, { route: 'cron-scan-retention' })
    return NextResponse.json({ ok: false, error: 'retention_failed' }, { status: 503 })
  }
}
