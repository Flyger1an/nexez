import { describe, it, expect, vi, beforeEach } from 'vitest'

const { executeNegotiation, executeBooking } = vi.hoisted(() => ({
  executeNegotiation: vi.fn(),
  executeBooking: vi.fn(),
}))
vi.mock('../agents/nexie', () => ({ executeNegotiation, executeBooking }))
vi.mock('../observability', () => ({ captureError: vi.fn(), captureEvent: vi.fn() }))

import {
  recoverStuckApprovals,
  STUCK_AFTER_MS,
  MAX_RECOVERY_ATTEMPTS,
} from '../agents/nexie-approval-recovery'

const NOW = 1_800_000_000_000
const STUCK_AT = new Date(NOW - STUCK_AFTER_MS - 60_000).toISOString()

type Row = {
  id: string
  user_id: string
  tool_name: string
  payload: Record<string, unknown>
  decided_at: string | null
  recovery_attempts: number
}

/** Minimal stand-in for the admin client: records every update so a test can assert
 * what the sweep wrote, and lets a test force the lease to lose. */
function adminMock(rows: Row[], opts: { claimFails?: boolean } = {}) {
  const updates: Array<Record<string, unknown>> = []
  const builder = (table: string) => {
    const state: { payload?: Record<string, unknown> } = {}
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      lt: () => chain,
      or: () => chain,
      order: () => chain,
      limit: () => chain,
      returns: () => Promise.resolve({ data: rows }),
      update: (payload: Record<string, unknown>) => {
        state.payload = payload
        updates.push({ table, ...payload })
        return chain
      },
      maybeSingle: () => Promise.resolve({ data: opts.claimFails ? null : { id: 'a1' } }),
      then: (res: any) => res({ data: null, error: null }),
    }
    return chain
  }
  return {
    client: {
      from: builder,
      auth: { admin: { getUserById: async () => ({ data: { user: { email: 'buyer@x.com' } } }) } },
    } as any,
    updates,
  }
}

const stuckRow = (over: Partial<Row> = {}): Row => ({
  id: 'a1',
  user_id: 'u1',
  tool_name: 'initiate_negotiation',
  payload: { slug: 'acme', offer: 'services-0' },
  decided_at: STUCK_AT,
  recovery_attempts: 0,
  ...over,
})

describe('recoverStuckApprovals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    executeNegotiation.mockResolvedValue({ message: 'ok', url: 'https://x/negotiate/1' })
    executeBooking.mockResolvedValue({ message: 'ok' })
  })

  it('does nothing when no approval is stuck', async () => {
    const { client } = adminMock([])
    expect(await recoverStuckApprovals(client, { now: NOW })).toEqual({
      scanned: 0,
      recovered: 0,
      failed: 0,
      skipped: 0,
    })
    expect(executeNegotiation).not.toHaveBeenCalled()
  })

  // The whole point: the action is replayed under the key the original attempt used,
  // so a crash AFTER the action succeeded resolves to the same negotiation rather
  // than a second one.
  it('replays with the original deterministic idempotency key', async () => {
    const { client } = adminMock([stuckRow()])
    const summary = await recoverStuckApprovals(client, { now: NOW })
    expect(summary.recovered).toBe(1)
    const [payload, buyer, key] = executeNegotiation.mock.calls[0]
    expect(key).toBe('nexie:a1:approved-action')
    expect(payload).toMatchObject({ slug: 'acme' })
    expect(buyer).toEqual({ email: 'buyer@x.com', userId: 'u1' })
  })

  it('routes a booking approval to executeBooking', async () => {
    const { client } = adminMock([stuckRow({ tool_name: 'book_offer' })])
    await recoverStuckApprovals(client, { now: NOW })
    expect(executeBooking).toHaveBeenCalledTimes(1)
    expect(executeNegotiation).not.toHaveBeenCalled()
  })

  it('marks the row EXECUTED with the result', async () => {
    const { client, updates } = adminMock([stuckRow()])
    await recoverStuckApprovals(client, { now: NOW })
    const executed = updates.find((u) => u.status === 'EXECUTED')
    expect(executed).toBeTruthy()
    expect(executed).toMatchObject({ result: { message: 'ok', url: 'https://x/negotiate/1' } })
    expect(executed!.completed_at).toBeTruthy()
  })

  // The lease is what makes overlapping runs safe. Losing it must mean doing nothing,
  // not doing the action anyway.
  it('does not execute when it loses the lease', async () => {
    const { client } = adminMock([stuckRow()], { claimFails: true })
    const summary = await recoverStuckApprovals(client, { now: NOW })
    expect(summary.skipped).toBe(1)
    expect(summary.recovered).toBe(0)
    expect(executeNegotiation).not.toHaveBeenCalled()
  })

  it('leaves the row APPROVED when the replay throws, so a later sweep retries', async () => {
    executeNegotiation.mockRejectedValue(new Error('upstream down'))
    const { client, updates } = adminMock([stuckRow()])
    const summary = await recoverStuckApprovals(client, { now: NOW })
    expect(summary.skipped).toBe(1)
    expect(updates.some((u) => u.status === 'FAILED')).toBe(false)
    expect(updates.some((u) => u.status === 'EXECUTED')).toBe(false)
  })

  // After the cap, the row is closed. The wording must not claim nothing happened:
  // the sweep genuinely does not know whether the original attempt went through.
  it('gives up after the attempt cap without asserting nothing was charged', async () => {
    const { client, updates } = adminMock([stuckRow({ recovery_attempts: MAX_RECOVERY_ATTEMPTS })])
    const summary = await recoverStuckApprovals(client, { now: NOW })
    expect(summary.failed).toBe(1)
    expect(executeNegotiation).not.toHaveBeenCalled()
    const failed = updates.find((u) => u.status === 'FAILED')
    expect(failed!.error).toMatch(/may or may not have gone through/i)
    expect(failed!.error).not.toMatch(/nothing was charged/i)
  })

  it('counts the attempt when it claims a row', async () => {
    const { client, updates } = adminMock([stuckRow({ recovery_attempts: 1 })])
    await recoverStuckApprovals(client, { now: NOW })
    const claim = updates.find((u) => u.recovery_attempts !== undefined)
    expect(claim!.recovery_attempts).toBe(2)
    expect(claim!.recovery_attempted_at).toBe(new Date(NOW).toISOString())
  })
})
