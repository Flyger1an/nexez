import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { QueryContext } from '../../../test/supabase-mock'

// Route database access through a hoisted, per-test-mutable handler.
const { dbRef } = vi.hoisted(() => ({
  dbRef: { handler: (_ctx: any) => ({ data: null, error: null }) as { data?: any; error?: any } },
}))

vi.mock('../../../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../../../test/supabase-mock')
  return { supabase: createSupabaseMock((ctx) => dbRef.handler(ctx)) }
})
vi.mock('../../../lib/email', () => ({
  buildNegotiationEmail: vi.fn(() => ({ subject: 's', html: 'h', text: 't' })),
  sendEmail: vi.fn(),
}))
// Rate limiting has its own dedicated test (lib/rate-limit.test.ts). The module
// uses a process-wide bucket Map that would leak across these many POSTs, so stub
// it to always proceed and keep the routing assertions deterministic.
vi.mock('../../../lib/rate-limit', () => ({
  enforceNegotiationRateLimit: () => null,
}))
// Admin + plan surface. Paid public capabilities require this authoritative
// resolver; a missing service-role environment is tested as a fail-closed 503.
const { adminRef } = vi.hoisted(() => ({ adminRef: { hasEnv: true, allowed: true, paused: false } }))
vi.mock('../../../utils/supabase/admin', async () => {
  // Back the admin client with the dbRef handler so the route's page and billing
  // reads resolve to the per-test rows.
  const { createSupabaseMock } = await import('../../../test/supabase-mock')
  return {
    createAdminClient: () => createSupabaseMock((ctx) => dbRef.handler(ctx)),
    hasSupabaseAdminEnv: () => adminRef.hasEnv,
  }
})
vi.mock('../../../lib/server/plan', () => ({
  ownerAllows: async () => adminRef.allowed,
  getOwnerBillingState: async () => ({ isPaused: adminRef.paused }),
}))
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: () => {} } // run nothing after the response in tests
})

// The token the (mocked) service "persisted" on the negotiation row. The route must
// return exactly this in statusToken/statusUrl - a regression here means every
// fresh proposal's status poll 404s (the route once minted its own random token).
const PERSISTED_STATUS_TOKEN = 'persisted-status-token-abc123'

vi.mock('../../../lib/negotiation.service', () => ({
  negotiationService: {
    submitProposal: vi.fn().mockImplementation(async (params: any) => {
      const id = params.negotiationId || 'new-neg-id'
      return {
        negotiationId: id,
        status: 'negotiation',
        decisionPending: true,
        persistentLink: `https://test/negotiate/${id}?token=${PERSISTED_STATUS_TOKEN}`,
        statusToken: PERSISTED_STATUS_TOKEN,
        replayed: false,
      }
    }),
    // Fires inside after() (a no-op in tests) - present so the route reference resolves.
    runDecision: vi.fn().mockResolvedValue(undefined),
  },
}))

import { POST } from './route'

const pageWithOffer = {
  id: 'p1',
  owner_id: 'o1',
  slug: 'demo',
  name: 'Demo Co',
  services: [{ name: 'Consult', price: '$100', description: '', url: '' }],
  products: [],
  contact_email: null,
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://nexez.test/api/negotiations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
    body: JSON.stringify(body),
  })

const badJsonPost = () =>
  new Request('https://nexez.test/api/negotiations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: '{',
  })

describe('POST /api/negotiations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbRef.handler = () => ({ data: null, error: null })
    adminRef.hasEnv = true
    adminRef.allowed = true
    adminRef.paused = false
  })
  afterEach(() => vi.unstubAllEnvs())

  describe('plan + pause gates (admin-env path)', () => {
    beforeEach(() => {
      adminRef.hasEnv = true
      dbRef.handler = (ctx: QueryContext) => (ctx.table === 'pages' ? { data: pageWithOffer, error: null } : { data: null, error: null })
    })

    it('403 when the owner is not on a plan that accepts offers', async () => {
      adminRef.allowed = false
      expect((await POST(post({ slug: 'demo', offer: 'services-0' }))).status).toBe(403)
    })

    it('402 when the seller storefront is PAUSED (offline — no proposal thread, no seller ping)', async () => {
      adminRef.allowed = true
      adminRef.paused = true
      const res = await POST(post({ slug: 'demo', offer: 'services-0' }))
      expect(res.status).toBe(402)
      expect((await res.json()).error).toMatch(/paused/i)
      // the service must never run for a paused seller
      const { negotiationService } = await import('../../../lib/negotiation.service')
      expect(negotiationService.submitProposal).not.toHaveBeenCalled()
    })

    it('proceeds when the owner is allowed and NOT paused', async () => {
      adminRef.allowed = true
      adminRef.paused = false
      const res = await POST(post({ slug: 'demo', offer: 'services-0' }))
      expect(res.status).toBe(200)
      const { negotiationService } = await import('../../../lib/negotiation.service')
      expect(negotiationService.submitProposal).toHaveBeenCalled()
    })
  })

  it('503 when owner entitlement cannot be verified', async () => {
    adminRef.hasEnv = false
    const res = await POST(post({ slug: 'demo', offer: 'services-0' }))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'entitlement_unavailable' })
    const { negotiationService } = await import('../../../lib/negotiation.service')
    expect(negotiationService.submitProposal).not.toHaveBeenCalled()
  })

  it('400 when slug or offer is missing', async () => {
    expect((await POST(post({ slug: '', offer: '' }))).status).toBe(400)
    expect((await POST(post({ slug: 'demo' }))).status).toBe(400)
  })

  it('400 for malformed JSON', async () => {
    expect((await POST(badJsonPost())).status).toBe(400)
  })

  it('404 when the published page is not found', async () => {
    dbRef.handler = () => ({ data: null, error: { message: 'not found' } })
    expect((await POST(post({ slug: 'missing', offer: 'services-0' }))).status).toBe(404)
  })

  it('404 when the offer is not found on the page', async () => {
    dbRef.handler = (ctx: QueryContext) =>
      ctx.table === 'pages' ? { data: { ...pageWithOffer, services: [], products: [] }, error: null } : { data: null }
    expect((await POST(post({ slug: 'demo', offer: 'services-0' }))).status).toBe(404)
  })

  it('dryRun validates without inserting', async () => {
    // Legacy semantics: a dry run validates the proposal but persists nothing -
    // no negotiation-service call (which inserts + queues the LLM) and no inserts.
    const ops: string[] = []
    dbRef.handler = (ctx: QueryContext) => {
      ops.push(`${ctx.table}:${ctx.op}`)
      return ctx.table === 'pages' ? { data: pageWithOffer, error: null } : { data: null, error: null }
    }
    const res = await POST(post({ slug: 'demo', offer: 'services-0', dryRun: true }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, dryRun: true })
    expect(json.rulesEvaluation).toBeTruthy()
    expect(json.negotiationId).toBeUndefined()
    expect(json.statusToken).toBeUndefined()

    const { negotiationService } = await import('../../../lib/negotiation.service')
    expect(negotiationService.submitProposal).not.toHaveBeenCalled()
    expect(ops.some((o) => o.includes('insert'))).toBe(false)
  })

  it('binds a required approval token to the exact validated proposal', async () => {
    vi.stubEnv('NEXEZ_ACTION_APPROVAL_SECRET', 'route-test-secret-with-at-least-thirty-two-characters')
    vi.stubEnv('NEXEZ_REQUIRE_ACTION_APPROVAL_TOKEN', 'true')
    dbRef.handler = (ctx: QueryContext) =>
      ctx.table === 'pages' ? { data: pageWithOffer, error: null } : { data: null, error: null }

    const preview = await POST(post({
      slug: 'demo',
      offer: 'services-0',
      budget: '$90',
      query: 'Keep the original scope.',
      dryRun: true,
    }))
    const validation = await preview.json()
    expect(validation.approvalTokenRequired).toBe(true)
    expect(validation.approvalToken).toMatch(/^v1\./)

    const approved = await POST(post({
      slug: 'demo',
      offer: 'services-0',
      budget: '$90',
      query: 'Keep the original scope.',
      approvalToken: validation.approvalToken,
    }))
    expect(approved.status).toBe(200)

    const changed = await POST(post({
      slug: 'demo',
      offer: 'services-0',
      budget: '$75',
      query: 'Keep the original scope.',
      approvalToken: validation.approvalToken,
    }))
    expect(changed.status).toBe(403)
    expect((await changed.json()).code).toBe('approval_invalid')
  })

  it('hashes accepted retry keys and reports replay-safe action metadata', async () => {
    dbRef.handler = (ctx: QueryContext) =>
      ctx.table === 'pages' ? { data: pageWithOffer, error: null } : { data: null, error: null }
    const rawKey = 'proposal-turn-1234567890'
    const res = await POST(post(
      { slug: 'demo', offer: 'services-0', budget: '$90' },
      { 'idempotency-key': rawKey, 'x-nexez-client': 'openclaw-plugin/0.2.0' },
    ))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ idempotencyKeyAccepted: true, replayed: false })

    const { negotiationService } = await import('../../../lib/negotiation.service')
    const params = (negotiationService.submitProposal as any).mock.calls[0][0]
    expect(params.idempotencyKeyHash).toMatch(/^[a-f0-9]{64}$/)
    expect(params.idempotencyKeyHash).not.toContain(rawKey)
    expect(params.idempotencyRequestHash).toMatch(/^[a-f0-9]{64}$/)
    expect(params.buyerProposal.agentClient).toBe('openclaw-plugin/0.2.0')
  })

  it('rejects malformed idempotency keys before invoking the negotiation service', async () => {
    const { negotiationService } = await import('../../../lib/negotiation.service')
    const res = await POST(post(
      { slug: 'demo', offer: 'services-0' },
      { 'idempotency-key': 'short' },
    ))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('invalid_idempotency_key')
    expect(negotiationService.submitProposal).not.toHaveBeenCalled()
  })

  it('fresh proposal returns the async pending shape (decision is polled, not inline)', async () => {
    const ops: string[] = []
    dbRef.handler = (ctx: QueryContext) => {
      ops.push(`${ctx.table}:${ctx.op}`)
      return ctx.table === 'pages' ? { data: pageWithOffer, error: null } : { data: null, error: null }
    }
    const res = await POST(post({ slug: 'demo', offer: 'services-0', buyerAgent: 'TestBot' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    // Full-async contract: status is 'negotiation', the decision is NOT inline.
    expect(body).toMatchObject({ ok: true, status: 'negotiation', decisionPending: true })
    expect(body.decision).toBeUndefined()
    expect(body.autoAccepted).toBeUndefined()
    // The real inserts happen inside the (module-mocked) service; we still see the page lookup.
    expect(ops.some((o: string) => o.includes('pages'))).toBe(true)
  })

  it('caps an oversized buyer query before it reaches the service (prompt-stuffing guard)', async () => {
    dbRef.handler = (ctx: QueryContext) => (ctx.table === 'pages' ? { data: pageWithOffer, error: null } : { data: null, error: null })
    const { negotiationService } = await import('../../../lib/negotiation.service')
    await POST(post({ slug: 'demo', offer: 'services-0', query: 'a'.repeat(9000), buyerAgent: 'TestBot' }))
    const passed = (negotiationService.submitProposal as any).mock.calls[0][0]
    expect(passed.buyerProposal.query.length).toBeLessThanOrEqual(2000 + 20)
    expect(passed.buyerProposal.query.endsWith('[truncated]')).toBe(true)
  })

  it('escrow mode flips to manual_capture_ready when Stripe is configured', async () => {
    dbRef.handler = (ctx: QueryContext) => (ctx.table === 'pages' ? { data: pageWithOffer, error: null } : { data: null, error: null })

    let body = await (await POST(post({ slug: 'demo', offer: 'services-0' }))).json()
    expect(body.escrowMode).toBe('not_configured')

    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x')
    body = await (await POST(post({ slug: 'demo', offer: 'services-0' }))).json()
    expect(body.escrowMode).toBe('manual_capture_ready')
  })

  it('surfaces the persisted status token + statusUrl for polling (never mints its own)', async () => {
    dbRef.handler = (ctx: QueryContext) => {
      if (ctx.table === 'pages') return { data: pageWithOffer, error: null }
      return { data: null, error: null }
    }
    const body = await (await POST(post({ slug: 'demo', offer: 'services-0', budget: '$90' }))).json()
    expect(body.status).toBe('negotiation')
    expect(body.decisionPending).toBe(true)
    // Strict: statusToken/statusUrl must carry the persisted token so status polls resolve.
    expect(body.statusToken).toBe(PERSISTED_STATUS_TOKEN)
    expect(body.statusUrl).toContain('id=new-neg-id')
    expect(body.statusUrl).toContain(`token=${PERSISTED_STATUS_TOKEN}`)
  })

  it('passes continuation credentials through and 404s on a token mismatch', async () => {
    dbRef.handler = (ctx: QueryContext) =>
      ctx.table === 'pages' ? { data: pageWithOffer, error: null } : { data: null, error: null }

    const { negotiationService } = await import('../../../lib/negotiation.service')

    // Continuation: negotiationId + statusToken must reach the service untouched.
    const res = await POST(post({ slug: 'demo', offer: 'services-0', negotiationId: 'neg-1', statusToken: 'tok-1' }))
    expect(res.status).toBe(200)
    expect(negotiationService.submitProposal).toHaveBeenCalledWith(
      expect.objectContaining({ negotiationId: 'neg-1', statusToken: 'tok-1' }),
    )

    // Wrong/missing token: the service raises a 404-shaped error → constant 404, no 500.
    const notFound = new Error('Negotiation not found.') as Error & { status: number }
    notFound.status = 404
    ;(negotiationService.submitProposal as any).mockRejectedValueOnce(notFound)
    const missRes = await POST(post({ slug: 'demo', offer: 'services-0', negotiationId: 'neg-1', statusToken: 'wrong' }))
    expect(missRes.status).toBe(404)
    expect(await missRes.json()).toEqual({ error: 'Negotiation not found.' })
  })

  it('409s when a decision is already in progress (JSON), redirects to the thread (form)', async () => {
    dbRef.handler = (ctx: QueryContext) =>
      ctx.table === 'pages' ? { data: pageWithOffer, error: null } : { data: null, error: null }
    const { negotiationService } = await import('../../../lib/negotiation.service')

    const conflict = new Error('A decision is already in progress for this negotiation.') as Error & { status: number }
    conflict.status = 409
    ;(negotiationService.submitProposal as any).mockRejectedValue(conflict)

    const jsonRes = await POST(post({ slug: 'demo', offer: 'services-0', negotiationId: 'neg-1', statusToken: 'tok-1' }))
    expect(jsonRes.status).toBe(409)

    const form = new URLSearchParams({ slug: 'demo', offer: 'services-0', query: 'q', negotiationId: 'neg-1', statusToken: 'tok-1' })
    const formRes = await POST(
      new Request('https://nexez.test/api/negotiations', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      }),
    )
    expect(formRes.status).toBe(303)
    expect(formRes.headers.get('location')).toContain('/negotiate/neg-1')
  })

  it('form-post continuations carry negotiationId/statusToken and redirect to the thread', async () => {
    dbRef.handler = (ctx: QueryContext) =>
      ctx.table === 'pages' ? { data: pageWithOffer, error: null } : { data: null, error: null }

    const form = new URLSearchParams({
      slug: 'demo',
      offer: 'services-0',
      query: 'follow-up',
      negotiationId: 'neg-7',
      statusToken: 'tok-7',
    })
    const res = await POST(
      new Request('https://nexez.test/api/negotiations', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      }),
    )
    const { negotiationService } = await import('../../../lib/negotiation.service')
    expect(negotiationService.submitProposal).toHaveBeenCalledWith(
      expect.objectContaining({ negotiationId: 'neg-7', statusToken: 'tok-7' }),
    )
    // Continuations land back on the persistent thread, not the public page.
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('/negotiate/neg-7')
  })

  it('surfaces error when the negotiation service fails (e.g. RLS)', async () => {
    dbRef.handler = (ctx: QueryContext) =>
      ctx.table === 'pages' ? { data: pageWithOffer, error: null } : { data: null, error: null }

    const { negotiationService } = await import('../../../lib/negotiation.service')
    ;(negotiationService.submitProposal as any).mockRejectedValueOnce(
      new Error('new row violates row-level security policy'),
    )
    const res = await POST(post({ slug: 'demo', offer: 'services-0' }))
    expect(res.status).toBe(500)
  })
})
