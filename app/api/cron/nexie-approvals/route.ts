import { NextResponse } from 'next/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { recoverStuckApprovals } from '../../../../lib/agents/nexie-approval-recovery'

// Scheduled sweep for Nexie actions that were approved but never finished, because
// the process died between the compare-and-swap that claims the approval and the
// write that records the outcome. Those rows are otherwise unreclaimable: the CAS
// requires status = 'PENDING'.
//
// Protected: scheduled runs must send `Authorization: Bearer ${CRON_SECRET}`, the
// same guard the other cron routes use.
//
// Idempotent by construction. Each row is leased before any work, and the action
// itself is replayed under its original idempotency key, so a run that overlaps
// another (or repeats one) cannot produce a duplicate booking or negotiation.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, error: 'cron_secret_not_configured' }, { status: 503 })
  }
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  }

  const summary = await recoverStuckApprovals(createAdminClient())
  return NextResponse.json({ ok: true, ...summary })
}
