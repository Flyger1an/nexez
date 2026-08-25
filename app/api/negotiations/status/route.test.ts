import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from '../../../../test/supabase-mock'
import { hashBearerToken } from '../../../../lib/server/bearer-token'

vi.mock('../../../../utils/supabase/admin', () => ({ createAdminClient: vi.fn(), hasSupabaseAdminEnv: vi.fn() }))

import { GET } from './route'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

const req = (params: Record<string, string>) =>
  new Request(`https://nexez.test/api/negotiations/status?${new URLSearchParams(params)}`)

describe('GET /api/negotiations/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true)
  })

  it('503 when the service role is not configured', async () => {
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(false)
    expect((await GET(req({ id: 'x', token: 'y' }))).status).toBe(503)
  })

  it('400 when id or token is missing', async () => {
    expect((await GET(req({ id: 'x' }))).status).toBe(400)
    expect((await GET(req({ token: 'y' }))).status).toBe(400)
  })

  it('constant 404 on id/token mismatch (no existence leak)', async () => {
    vi.mocked(createAdminClient).mockReturnValue(createSupabaseMock(() => ({ data: null })) as any)
    const res = await GET(req({ id: 'real-id', token: 'wrong-token' }))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('Negotiation not found.')
  })

  it('returns status + label + next step for a valid id/token pair, scoped by BOTH', async () => {
    let eqs: Record<string, any> = {}
    vi.mocked(createAdminClient).mockReturnValue(
      createSupabaseMock((ctx) => {
        eqs = ctx.eqs
        return { data: { id: 'n1', status: 'agreement_proposed', offer_name: 'Consult', updated_at: '2026-06-10T00:00:00Z' } }
      }) as any,
    )
    const res = await GET(req({ id: 'n1', token: 'tok123' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      id: 'n1',
      status: 'agreement_proposed',
      statusLabel: 'Agreement proposed',
      offer: 'Consult',
    })
    expect(body.next).toMatch(/agreement proposed/i)
    expect(eqs.id).toBe('n1')
    // The route matches the blind index now, not the plaintext column.
    expect(eqs.status_token_sha256).toBe(hashBearerToken('tok123'))
  })

  it('reports decisionPending while the async decision is still running (decision withheld)', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      createSupabaseMock(() => ({
        data: {
          id: 'n1',
          status: 'negotiation',
          offer_name: 'Consult',
          updated_at: null,
          decision_pending: true,
          decision_seq: 0,
          metadata: {
            last_decision: { action: 'counter', reasoning: 'stale', internalNotes: 'secret' },
            rules_evaluation: {
              decision: 'flag',
              checks: [{ key: 'price', status: 'fail', reason: 'outside_price_rules' }],
            },
          },
        },
      })) as any,
    )
    const body = await (await GET(req({ id: 'n1', token: 'tok' }))).json()
    expect(body.decisionPending).toBe(true)
    expect(body.decision).toBeNull() // not surfaced until it lands
    expect(body.ruleEvaluation).toBeNull()
    expect(body.next).toMatch(/responding|evaluat/i)
  })

  it('surfaces the landed decision (sanitized) + decisionSeq; never leaks internalNotes', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      createSupabaseMock(() => ({
        data: {
          id: 'n1',
          status: 'negotiation',
          offer_name: 'Consult',
          updated_at: '2026-06-11T00:00:00Z',
          decision_pending: false,
          decision_seq: 2,
          metadata: {
            last_decision: {
              action: 'counter',
              reasoning: 'Closer to our floor.',
              counter: { priceCents: 90000 },
              internalNotes: 'owner-only - never send to the agent',
            },
            rules_evaluation: {
              schemaVersion: 2,
              decision: 'flag',
              reasons: ['below_min_price', 'private_floor_80000'],
              checks: [
                { key: 'price', status: 'fail', reason: 'outside_price_rules' },
                { key: 'revision_limit', status: 'review', reason: 'revision_count_not_provided' },
              ],
              minPrice: '$800',
            },
          },
        },
      })) as any,
    )
    const body = await (await GET(req({ id: 'n1', token: 'tok' }))).json()
    expect(body.decisionPending).toBe(false)
    expect(body.decisionSeq).toBe(2)
    expect(body.decision).toMatchObject({ action: 'counter', counter: { priceCents: 90000 } })
    // Privacy invariant: the owner-private internalNotes must never reach the agent.
    expect(body.decision.internalNotes).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('owner-only')
    expect(body.ruleEvaluation).toMatchObject({
      outcome: 'outside_rules',
      checks: [
        { key: 'price', status: 'fail' },
        { key: 'revision_limit', status: 'review' },
      ],
    })
    expect(JSON.stringify(body.ruleEvaluation)).not.toMatch(/800|below_min|private_floor|minPrice/)
    expect(body.next).toMatch(/counter/i)
  })
})
