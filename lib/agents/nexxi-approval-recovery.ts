import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { executeBooking, executeNegotiation } from './nexxi'
import { captureError, captureEvent } from '../observability'

// Finish Nexxi actions that were claimed but never completed.
//
// `approveAction` compare-and-swaps PENDING -> APPROVED, executes the money action
// in-process, then writes EXECUTED or FAILED. If the process dies in between, the row
// stays APPROVED with a null `completed_at`, and the CAS (which requires PENDING)
// means nothing can ever reclaim it. Without this sweep the action is wedged forever
// and the buyer is told nothing.
//
// RETRY RATHER THAN FAIL. The action is replay-safe: `nexxi:<id>:approved-action` is
// deterministic and travels as an `idempotency-key` header, so re-invoking returns
// the ORIGINAL negotiation or booking instead of creating a second one. Marking the
// row FAILED would be the easier fix and the wrong one: if the crash happened after
// the action succeeded, FAILED is a lie, and a buyer acting on it could double-book.

/** How long an APPROVED row may sit before the sweep treats it as abandoned. Actions
 * complete in seconds, so minutes of silence means the process is gone. Generous on
 * purpose: reaping a still-running action is harmless (idempotency covers it) but
 * pointless. */
export const STUCK_AFTER_MS = 5 * 60_000

/** Re-claim interval for a row the sweep already tried. Also the lease: a row stamped
 * within this window is skipped, so overlapping runs cannot both drive it. */
export const RETRY_AFTER_MS = 10 * 60_000

/** After this many attempts, stop retrying and mark the row FAILED with a message
 * that admits the uncertainty rather than asserting nothing happened. */
export const MAX_RECOVERY_ATTEMPTS = 3

type StuckRow = {
  id: string
  user_id: string
  tool_name: string
  payload: Record<string, unknown>
  decided_at: string | null
  recovery_attempts: number
}

export type RecoverySummary = {
  scanned: number
  recovered: number
  failed: number
  skipped: number
}

/**
 * Sweep abandoned approvals. Safe to run on a schedule and safe to run concurrently:
 * every row is leased via `recovery_attempted_at` before any work happens.
 */
export async function recoverStuckApprovals(
  admin: SupabaseClient,
  opts: { now?: number; limit?: number } = {},
): Promise<RecoverySummary> {
  const now = opts.now ?? Date.now()
  const limit = opts.limit ?? 25
  const stuckBefore = new Date(now - STUCK_AFTER_MS).toISOString()
  const retryBefore = new Date(now - RETRY_AFTER_MS).toISOString()

  const { data: rows } = await admin
    .from('agent_action_approvals')
    .select('id, user_id, tool_name, payload, decided_at, recovery_attempts')
    .eq('status', 'APPROVED')
    .is('completed_at', null)
    .lt('decided_at', stuckBefore)
    .or(`recovery_attempted_at.is.null,recovery_attempted_at.lt.${retryBefore}`)
    .order('decided_at', { ascending: true })
    .limit(limit)
    .returns<StuckRow[]>()

  const summary: RecoverySummary = { scanned: rows?.length ?? 0, recovered: 0, failed: 0, skipped: 0 }
  if (!rows?.length) return summary

  for (const row of rows) {
    // Lease the row before doing anything. The guards repeat the selection criteria so
    // a racing sweep that got there first loses: its update already moved
    // recovery_attempted_at out of our window.
    const { data: claimed } = await admin
      .from('agent_action_approvals')
      .update({
        recovery_attempted_at: new Date(now).toISOString(),
        recovery_attempts: (row.recovery_attempts ?? 0) + 1,
      })
      .eq('id', row.id)
      .eq('status', 'APPROVED')
      .is('completed_at', null)
      .or(`recovery_attempted_at.is.null,recovery_attempted_at.lt.${retryBefore}`)
      .select('id')
      .maybeSingle()
    if (!claimed) {
      summary.skipped += 1
      continue
    }

    // Out of retries: stop, and say plainly that we do not know whether it ran. The
    // alternative wording ("nothing was charged") would be an assertion we cannot make.
    if ((row.recovery_attempts ?? 0) + 1 > MAX_RECOVERY_ATTEMPTS) {
      await admin
        .from('agent_action_approvals')
        .update({
          status: 'FAILED',
          error:
            'This action was interrupted and could not be completed automatically. It may or may not have gone through; check your orders before trying again.',
          completed_at: new Date(now).toISOString(),
        })
        .eq('id', row.id)
      summary.failed += 1
      captureEvent('nexxi.action.recovery', { tool: row.tool_name, outcome: 'exhausted' })
      continue
    }

    try {
      const buyer = { email: await lookupUserEmail(admin, row.user_id), userId: row.user_id }
      // The SAME key the original attempt used. This is what makes the retry a replay
      // rather than a second action.
      const idempotencyKey = `nexxi:${row.id}:approved-action`
      const result =
        row.tool_name === 'initiate_negotiation'
          ? await executeNegotiation(row.payload, buyer, idempotencyKey)
          : await executeBooking(row.payload, buyer, idempotencyKey)

      await admin
        .from('agent_action_approvals')
        .update({ status: 'EXECUTED', result, completed_at: new Date().toISOString() })
        .eq('id', row.id)
      summary.recovered += 1
      captureEvent('nexxi.action.recovery', { tool: row.tool_name, outcome: 'recovered' })
    } catch (err) {
      // Leave the row APPROVED so a later sweep can try again, up to the cap. Only the
      // attempt counter moved, which is the point of the lease.
      captureError(err, { scope: 'nexxi.action.recovery', tool: row.tool_name, approvalId: row.id })
      captureEvent('nexxi.action.recovery', { tool: row.tool_name, outcome: 'retry_pending' })
      summary.skipped += 1
    }
  }

  return summary
}

/** The buyer's account email is the contact of record for the action. A request-path
 * execution takes it from the session; a sweep has only the user id. */
async function lookupUserEmail(admin: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data } = await admin.auth.admin.getUserById(userId)
    return data?.user?.email ?? null
  } catch {
    return null
  }
}
