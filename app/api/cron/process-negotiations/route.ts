import { NextResponse } from 'next/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { captureError } from '../../../../lib/observability'
import { negotiationService } from '../../../../lib/negotiation.service'

// Bound the work per run so the cron stays fast and within the LLM's rate limits.
const LIMIT = 50
// Only re-drive rows the `after()` fast path should already have handled — a short
// grace avoids racing a decision that's mid-flight in a live request.
const STALE_MS = 2 * 60_000
// Skip rows another worker is actively processing (lease still fresh); re-pick a
// crashed worker's row once its lease expires. Matches the service's claim lease.
const LEASE_MS = 90_000
// A row still pending this long means a persistently failing provider/key — alert.
const STUCK_MS = 15 * 60_000
export const maxDuration = 60

/**
 * Async-decision backstop (Vercel cron — see vercel.json). The LLM negotiation
 * decision normally runs in a next/server `after()` callback right after the POST
 * response. If that never completes (serverless instance death, a cold edge), the
 * negotiation would sit `decision_pending` forever. This cron re-drives any stale
 * pending row via the same `runDecision` path — whose atomic claim makes it safe
 * even if the original `after()` is concurrently finishing.
 *
 * Protected: scheduled runs must send `Authorization: Bearer ${CRON_SECRET}`.
 * Local dev may run without the secret; production never should.
 */
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

  const admin = createAdminClient()
  const now = Date.now()

  const { data, error } = await admin
    .from('agent_negotiations')
    .select('id, decision_requested_at')
    .eq('decision_pending', true)
    .lt('decision_requested_at', new Date(now - STALE_MS).toISOString())
    // Don't re-drive a row whose lease is still fresh (after() or another cron run
    // is on it); the claim would no-op anyway, but this avoids the wasted work.
    .or(`decision_claimed_at.is.null,decision_claimed_at.lt.${new Date(now - LEASE_MS).toISOString()}`)
    .order('decision_requested_at', { ascending: true }) // oldest first — fairness
    .limit(LIMIT)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const rows = data ?? []
  let processed = 0
  let stuck = 0

  for (const row of rows) {
    // Surface rows that have been pending far longer than the fast path + this
    // cron should ever need — a sign the LLM provider/key is failing.
    const requestedAt = row.decision_requested_at ? new Date(row.decision_requested_at).getTime() : now
    if (now - requestedAt > STUCK_MS) {
      captureError(new Error('negotiation decision stuck pending'), {
        negotiationId: row.id,
        pendingMs: now - requestedAt,
      })
      stuck += 1
    }
    try {
      await negotiationService.runDecision(row.id)
      processed += 1
    } catch (err) {
      captureError(err instanceof Error ? err : new Error(String(err)), { negotiationId: row.id, phase: 'cron' })
    }
  }

  return NextResponse.json({ ok: true, scanned: rows.length, processed, stuck, ran_at: new Date(now).toISOString() })
}
