import { NextResponse } from 'next/server'
import { deliverQueuedSmsNotifications } from '@/lib/server/sms-notifications'
import { isTwilioMessagingDeliveryReady } from '@/lib/server/sms'
import { createAdminClient, hasSupabaseAdminEnv } from '@/utils/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 60

function cronAuthorization(request: Request): 'ok' | 'not_configured' | 'unauthorized' {
  const secret = process.env.CRON_SECRET
  if (!secret && process.env.NODE_ENV === 'production') return 'not_configured'
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) return 'unauthorized'
  return 'ok'
}

/**
 * Durable SMS outbox worker. The database claims a bounded batch atomically;
 * this route never accepts a caller-selected recipient or message body.
 */
export async function GET(request: Request) {
  const authorization = cronAuthorization(request)
  if (authorization === 'not_configured') {
    return NextResponse.json({ ok: false, error: 'cron_secret_not_configured' }, { status: 503 })
  }
  if (authorization === 'unauthorized') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasSupabaseAdminEnv() || !isTwilioMessagingDeliveryReady()) {
    return NextResponse.json({ ok: false, error: 'sms_not_configured' }, { status: 503 })
  }

  const result = await deliverQueuedSmsNotifications({ admin: createAdminClient() })
  if (result.skipped) {
    // Configuration may have changed after the preflight. Do not claim success
    // for a worker that deliberately sent nothing.
    return NextResponse.json({ ok: false, error: 'sms_not_configured' }, { status: 503 })
  }

  return NextResponse.json({ ok: true, ...result })
}
