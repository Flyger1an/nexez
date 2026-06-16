import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the network-touching deliverer so we test fireOwnerOutboundWebhooks'
// orchestration (query active → fire each → record status) deterministically.
// vi.hoisted so the mock fn exists before vi.mock's (hoisted) factory runs.
const { fireOutboundWebhook } = vi.hoisted(() => ({
  fireOutboundWebhook: vi.fn(async (url?: string) =>
    typeof url === 'string' && url.includes('fail') ? { ok: false, error: 'boom' } : { ok: true, status: 200 },
  ),
}))
vi.mock('../webhooks', () => ({ fireOutboundWebhook }))

import { fireOwnerOutboundWebhooks } from '../server/outbound-webhooks'

type Row = { id: string; url: string; secret: string | null }

function mockAdmin(rows: Row[], plan: { plan_id: string; status: string } | null = { plan_id: 'pro', status: 'active' }) {
  const updates: Array<{ id: unknown; patch: Record<string, unknown> }> = []
  const queries: Array<{ col: string; val: unknown }> = []
  const admin = {
    updates,
    queries,
    from(table: string) {
      // Dispatch is now Pro+-gated: getOwnerPlanId reads billing_subscriptions
      // (single .eq().maybeSingle()) before any webhook fires.
      if (table === 'billing_subscriptions') {
        return {
          select() {
            return {
              eq() {
                return { async maybeSingle() { return { data: plan, error: null } } }
              },
            }
          },
        }
      }
      return {
        select() {
          return {
            eq(col: string, val: unknown) {
              queries.push({ col, val })
              return {
                async eq(col2: string, val2: unknown) {
                  queries.push({ col: col2, val: val2 })
                  return { data: rows, error: null }
                },
              }
            },
          }
        },
        update(patch: Record<string, unknown>) {
          return {
            async eq(_col: string, val: unknown) {
              updates.push({ id: val, patch })
              return { error: null }
            },
          }
        },
      }
    },
  }
  return admin
}

const payload = { event: 'booking.received', timestamp: '2026-06-19T00:00:00Z', data: {} }

describe('fireOwnerOutboundWebhooks', () => {
  beforeEach(() => fireOutboundWebhook.mockClear())

  it('returns [] for a missing owner without touching the DB', async () => {
    const admin = mockAdmin([])
    expect(await fireOwnerOutboundWebhooks(admin, null, payload)).toEqual([])
    expect(fireOutboundWebhook).not.toHaveBeenCalled()
  })

  it('returns [] without firing when the owner plan does not allow outbound webhooks (downgrade)', async () => {
    // A Free (or downgraded) owner with active rows must NOT receive deliveries —
    // the dispatch-time plan re-check closes the retained-feature leak.
    const admin = mockAdmin(
      [{ id: 'a', url: 'https://hook.example.com/ok', secret: 'whsec_a' }],
      { plan_id: 'free', status: 'active' },
    )
    expect(await fireOwnerOutboundWebhooks(admin, 'owner-1', payload)).toEqual([])
    expect(fireOutboundWebhook).not.toHaveBeenCalled()
  })

  it('fires every active webhook with its url+secret and records per-endpoint status', async () => {
    const admin = mockAdmin([
      { id: 'a', url: 'https://hook.example.com/ok', secret: 'whsec_a' },
      { id: 'b', url: 'https://hook.example.com/fail', secret: null },
    ])
    const results = await fireOwnerOutboundWebhooks(admin, 'owner-1', payload)

    // Scoped to the owner's active webhooks.
    expect(admin.queries).toEqual(
      expect.arrayContaining([
        { col: 'owner_id', val: 'owner-1' },
        { col: 'active', val: true },
      ]),
    )
    // Delivered to each endpoint with the right signing secret + shared payload.
    expect(fireOutboundWebhook).toHaveBeenCalledTimes(2)
    expect(fireOutboundWebhook).toHaveBeenCalledWith('https://hook.example.com/ok', 'whsec_a', payload)
    expect(fireOutboundWebhook).toHaveBeenCalledWith('https://hook.example.com/fail', null, payload)
    // Results reflect success/failure.
    expect(results).toEqual([
      { id: 'a', endpoint: 'https://hook.example.com/ok', ok: true, status: 200, error: undefined },
      { id: 'b', endpoint: 'https://hook.example.com/fail', ok: false, status: undefined, error: 'boom' },
    ])
    // Status persisted per webhook.
    expect(admin.updates).toEqual([
      { id: 'a', patch: expect.objectContaining({ last_status: 'ok' }) },
      { id: 'b', patch: expect.objectContaining({ last_status: 'boom' }) },
    ])
  })
})
