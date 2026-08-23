import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueryContext } from '../../../../../../test/supabase-mock'

const refs = vi.hoisted(() => ({
  user: { id: 'owner-1' } as any,
  agreement: {
    id: 'agreement-1',
    owner_id: 'owner-1',
    status: 'active',
    access_token_encrypted: 'ciphertext-1',
  } as any,
  obligations: [
    { id: 'obligation-1', stage_id: 'commitment', stage_order: 1, label: 'Commitment', amount_cents: 100, status: 'paid' },
    { id: 'obligation-2', stage_id: 'completion', stage_order: 2, label: 'Completion', amount_cents: 100, status: 'pending' },
  ] as any[],
  accessToken: 'a'.repeat(64) as string | null,
  updates: [] as any[],
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('../../../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('../../../../../../lib/server/bearer-token', () => ({
  recoverBearerToken: vi.fn(() => refs.accessToken),
}))
vi.mock('../../../../../../utils/supabase/server', async () => {
  const { createSupabaseMock } = await import('../../../../../../test/supabase-mock')
  return {
    createClient: vi.fn(() => createSupabaseMock(() => ({ data: null, error: null }), { user: refs.user })),
  }
})
vi.mock('../../../../../../utils/supabase/admin', async () => {
  const { createSupabaseMock } = await import('../../../../../../test/supabase-mock')
  return {
    hasSupabaseAdminEnv: vi.fn(() => true),
    createAdminClient: vi.fn(() => createSupabaseMock((context: QueryContext) => {
      if (context.table === 'staged_settlement_agreements') {
        return { data: refs.agreement, error: null }
      }
      if (context.table === 'staged_settlement_obligations' && context.op === 'select') {
        return { data: refs.obligations, error: null }
      }
      if (context.table === 'staged_settlement_obligations' && context.op === 'update') {
        refs.updates.push(context.payload)
        return { data: { id: 'obligation-2' }, error: null }
      }
      return { data: null, error: null }
    })),
  }
})

import { POST } from './route'

function request() {
  return new Request('https://app.nexez.ai/api/staged-settlements/agreements/agreement-1/ready', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ stageId: 'completion' }),
  })
}

const context = { params: Promise.resolve({ id: 'agreement-1' }) }

describe('POST /api/staged-settlements/agreements/[id]/ready', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.user = { id: 'owner-1' }
    refs.agreement = {
      id: 'agreement-1',
      owner_id: 'owner-1',
      status: 'active',
      access_token_encrypted: 'ciphertext-1',
    }
    refs.obligations = [
      { id: 'obligation-1', stage_id: 'commitment', stage_order: 1, label: 'Commitment', amount_cents: 100, status: 'paid' },
      { id: 'obligation-2', stage_id: 'completion', stage_order: 2, label: 'Completion', amount_cents: 100, status: 'pending' },
    ]
    refs.accessToken = 'a'.repeat(64)
    refs.updates = []
  })

  it('readies the next obligation and returns the recoverable buyer endpoints', async () => {
    const response = await POST(request(), context)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      ok: true,
      agreementId: 'agreement-1',
      statusUrl: `https://nexez.test/api/staged-settlements/${'a'.repeat(64)}`,
      actionUrl: `https://nexez.test/api/staged-settlements/${'a'.repeat(64)}/checkout`,
      currentObligation: {
        stageId: 'completion',
        order: 2,
        amountCents: 100,
        status: 'ready_for_buyer_approval',
      },
    })
    expect(refs.updates).toHaveLength(1)
    expect(refs.updates[0]).toMatchObject({ status: 'ready_for_buyer_approval' })
  })

  it('replays buyer endpoints without mutation when the obligation is already ready', async () => {
    refs.obligations[1].status = 'ready_for_buyer_approval'
    const response = await POST(request(), context)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      ok: true,
      idempotentReplay: true,
      statusUrl: `https://nexez.test/api/staged-settlements/${'a'.repeat(64)}`,
      actionUrl: `https://nexez.test/api/staged-settlements/${'a'.repeat(64)}/checkout`,
      currentObligation: {
        stageId: 'completion',
        status: 'ready_for_buyer_approval',
      },
    })
    expect(refs.updates).toHaveLength(0)
  })

  it('fails closed before mutation when the buyer credential cannot be recovered', async () => {
    refs.accessToken = null
    const response = await POST(request(), context)
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'agreement_access_unavailable' })
    expect(refs.updates).toHaveLength(0)
  })

  it('does not expose buyer endpoints to a different authenticated owner', async () => {
    refs.user = { id: 'owner-2' }
    const response = await POST(request(), context)
    expect(response.status).toBe(404)
    expect(refs.updates).toHaveLength(0)
  })

  it('rejects readiness until every predecessor is paid', async () => {
    refs.obligations[0].status = 'payment_pending'
    const response = await POST(request(), context)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'obligation_not_readyable' })
    expect(refs.updates).toHaveLength(0)
  })
})
