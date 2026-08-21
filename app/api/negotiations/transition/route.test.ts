import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../../test/supabase-mock'

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('../../../../utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('../../../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => false),
  createAdminClient: vi.fn(),
}))
vi.mock('../../../../lib/server/negotiation-notifications', () => ({
  notifyBuyerOfNegotiationDecision: vi.fn(async () => undefined),
}))

import { POST } from './route'
import { createClient } from '../../../../utils/supabase/server'
import { notifyBuyerOfNegotiationDecision } from '../../../../lib/server/negotiation-notifications'

const post = (body: unknown) =>
  new Request('https://nexez.test/api/negotiations/transition', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

function withNegotiation(neg: any, options: { user?: any; rpcError?: any; page?: any } = {}) {
  let rpcPayload: any
  let updatePayload: any
  const user = options.user === undefined ? { id: 'owner-1' } : options.user
  vi.mocked(createClient).mockReturnValue(
    createSupabaseMock((ctx: QueryContext) => {
      if (ctx.table === 'agent_negotiations') {
        if (ctx.op === 'update') updatePayload = ctx.payload
        return { data: neg, error: null }
      }
      if (ctx.table === 'pages') {
        return {
          data: options.page ?? {
            services: [{ name: 'Consult', offerType: 'negotiable', rules: {} }],
            products: [],
          },
          error: null,
        }
      }
      if (ctx.table === 'rpc:nz_apply_owner_decision') {
        rpcPayload = ctx.payload
        if (options.rpcError) return { data: null, error: options.rpcError }
        const action = (ctx.payload?.p_decision as any)?.action
        const status = action === 'accept'
          ? 'agreement_proposed'
          : action === 'reject'
            ? 'declined'
            : action === 'pause'
              ? 'paused'
              : 'negotiation'
        return {
          data: {
            applied: true,
            negotiation: {
              ...neg,
              status,
              amount_cents: ctx.payload?.p_amount_cents ?? neg.amount_cents,
              settlement_state: ctx.payload?.p_settlement_state ?? neg.settlement_state,
              decision_seq: (neg.decision_seq ?? 0) + 1,
            },
          },
          error: null,
        }
      }
      return { data: null, error: null }
    }, { user }) as any,
  )
  return { getRpcPayload: () => rpcPayload, getUpdatePayload: () => updatePayload }
}

const openNegotiation = (overrides: any = {}) => ({
  id: 'n1',
  page_id: 'p1',
  owner_id: 'owner-1',
  slug: 'demo',
  offer_key: 'services-0',
  offer_name: 'Consult',
  status: 'negotiation',
  escrow_mode: 'manual_capture_ready',
  stripe_payment_intent_id: null,
  amount_cents: null,
  decision_seq: 2,
  buyer_email: 'buyer@example.com',
  status_token_encrypted: null,
  ...overrides,
})

describe('POST /api/negotiations/transition', () => {
  beforeEach(() => vi.clearAllMocks())

  it('401 when not authenticated', async () => {
    withNegotiation(openNegotiation(), { user: null })
    expect((await POST(post({ negotiationId: 'n1', to: 'declined' }))).status).toBe(401)
  })

  it('400 when no action or multiple actions are supplied', async () => {
    withNegotiation(openNegotiation())
    expect((await POST(post({ negotiationId: 'n1' }))).status).toBe(400)
    expect((await POST(post({ negotiationId: 'n1', to: 'declined', amountCents: 5000 }))).status).toBe(400)
    expect((await POST(post({ negotiationId: 'n1', to: 'banana' }))).status).toBe(400)
  })

  it('rejects the ambiguous legacy ownerMessage/proposed_price shape', async () => {
    withNegotiation(openNegotiation())
    const res = await POST(post({
      negotiationId: 'n1',
      ownerMessage: { action: 'counter', reasoning: 'legacy', proposed_price: 100 },
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/no longer accepted/i)
  })

  it('atomically applies a canonical counter in integer minor units', async () => {
    const state = withNegotiation(openNegotiation())
    const res = await POST(post({
      negotiationId: 'n1',
      decision: {
        action: 'counter',
        reasoning: 'Scope supports this price.',
        counter: { priceCents: 125_00, proposedDate: 'Next month' },
      },
    }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, status: 'negotiation', amountCents: 125_00, decisionSeq: 3 })
    expect(state.getRpcPayload()).toMatchObject({
      p_negotiation_id: 'n1',
      p_owner_id: 'owner-1',
      p_expected_seq: 2,
      p_amount_cents: 125_00,
      p_decision: { action: 'counter', counter: { priceCents: 125_00 } },
    })
    expect(notifyBuyerOfNegotiationDecision).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1' }), 'counter')
  })

  it('requires a concrete amount for acceptance', async () => {
    withNegotiation(openNegotiation())
    const res = await POST(post({
      negotiationId: 'n1',
      decision: { action: 'accept', reasoning: 'Accepted.' },
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/amountCents/i)
  })

  it('classifies settlement and advances the buyer-visible decision atomically', async () => {
    const state = withNegotiation(openNegotiation(), {
      page: {
        services: [{ name: 'Consult', offerType: 'negotiable', rules: { autoSettleMax: '1000' } }],
        products: [],
      },
    })
    const res = await POST(post({
      negotiationId: 'n1',
      decision: { action: 'accept', reasoning: 'Accepted.', amountCents: 150_000 },
    }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      status: 'agreement_proposed',
      amountCents: 150_000,
      settlementState: 'awaiting_approval',
      decisionSeq: 3,
    })
    expect(state.getRpcPayload()).toMatchObject({
      p_amount_cents: 150_000,
      p_settlement_state: 'awaiting_approval',
    })
  })

  it('allows explicit offline completion only when payment is not configured', async () => {
    const state = withNegotiation(openNegotiation({
      status: 'agreement_proposed',
      escrow_mode: 'not_configured',
      amount_cents: 10_000,
    }))
    const res = await POST(post({ negotiationId: 'n1', to: 'complete' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'complete', settlement: 'offline' })
    expect(state.getUpdatePayload()).toMatchObject({ status: 'complete' })
  })

  it('never completes a configured agreement before buyer funding', async () => {
    withNegotiation(openNegotiation({ status: 'agreement_proposed', amount_cents: 10_000 }))
    const res = await POST(post({ negotiationId: 'n1', to: 'complete' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/offline, unfunded/i)
  })

  it('never completes a held payment outside the escrow capture route', async () => {
    withNegotiation(openNegotiation({
      status: 'held',
      escrow_mode: 'manual_capture_created',
      stripe_payment_intent_id: 'pi_1',
    }))
    const res = await POST(post({ negotiationId: 'n1', to: 'complete' }))
    expect(res.status).toBe(409)
  })

  it('maps decline and pause controls into sequenced owner decisions', async () => {
    const declined = withNegotiation(openNegotiation())
    expect((await POST(post({ negotiationId: 'n1', to: 'declined' }))).status).toBe(200)
    expect(declined.getRpcPayload().p_decision.action).toBe('reject')

    const paused = withNegotiation(openNegotiation())
    expect((await POST(post({ negotiationId: 'n1', to: 'paused' }))).status).toBe(200)
    expect(paused.getRpcPayload().p_decision.action).toBe('pause')
  })

  it('only permits resume or reject while paused', async () => {
    const paused = openNegotiation({ status: 'paused' })
    withNegotiation(paused)
    const counter = await POST(post({
      negotiationId: 'n1',
      decision: {
        action: 'counter',
        reasoning: 'This must wait until resume.',
        counter: { priceCents: 125_00 },
      },
    }))
    expect(counter.status).toBe(409)

    const resumed = withNegotiation(paused)
    expect((await POST(post({ negotiationId: 'n1', to: 'negotiation' }))).status).toBe(200)
    expect(resumed.getRpcPayload().p_decision.action).toBe('resume')
  })

  it('rejects resume when the negotiation is already active', async () => {
    withNegotiation(openNegotiation())
    const res = await POST(post({
      negotiationId: 'n1',
      decision: { action: 'resume', reasoning: 'Already active.' },
    }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when the expected decision sequence is stale', async () => {
    withNegotiation(openNegotiation(), {
      rpcError: { code: '40001', message: 'negotiation changed; reload before responding' },
    })
    const res = await POST(post({ negotiationId: 'n1', to: 'declined' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/reload/i)
  })

  it('404 when the negotiation is not the owner’s', async () => {
    vi.mocked(createClient).mockReturnValue(
      createSupabaseMock(() => ({ data: null, error: null }), { user: { id: 'owner-1' } }) as any,
    )
    expect((await POST(post({ negotiationId: 'nope', to: 'declined' }))).status).toBe(404)
  })
})
