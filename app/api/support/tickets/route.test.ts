import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../../../test/supabase-mock'

const refs = vi.hoisted(() => ({
  user: { id: 'owner-1', email: 'owner@nexez.test' } as any,
  plan: 'free' as unknown,
  planError: false,
  captured: null as QueryContext | null,
  supportResult: {
    data: { id: 'ticket-1', status: 'open', created_at: '2026-08-22T12:00:00.000Z' },
    error: null,
  } as any,
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })),
}))
vi.mock('../../../../lib/rate-limit', () => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('../../../../utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('../../../../lib/server/plan', () => ({
  getOwnerPlanId: vi.fn(async () => {
    if (refs.planError) throw new Error('entitlement lookup unavailable')
    return refs.plan
  }),
}))

import { GET, POST } from './route'
import { createClient } from '../../../../utils/supabase/server'

function wire(user: any = refs.user) {
  vi.mocked(createClient).mockReturnValue(createSupabaseMock((ctx) => {
    if (ctx.table === 'support_tickets' && ctx.op === 'insert') {
      refs.captured = ctx
      return refs.supportResult
    }
    if (ctx.table === 'pages') {
      return { data: { id: 'page-1', name: 'Acme', slug: 'acme' }, error: null }
    }
    return { data: null, error: null }
  }, { user }) as any)
}

function post(body: unknown) {
  return new Request('https://app.nexez.ai/api/support/tickets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validTicket = {
  pageId: 'workspace',
  subject: 'Checkout incident',
  category: 'bug',
  priority: 'urgent',
  query: 'Checkout is returning an unexpected error.',
}

describe('/api/support/tickets service entitlement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refs.plan = 'free'
    refs.planError = false
    refs.captured = null
    refs.supportResult = {
      data: { id: 'ticket-1', status: 'open', created_at: '2026-08-22T12:00:00.000Z' },
      error: null,
    }
  })

  it('requires authentication for the support service read', async () => {
    wire(null)
    expect((await GET()).status).toBe(401)
  })

  it('returns the current authoritative Scale priority service', async () => {
    refs.plan = 'scale'
    wire()

    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      supportService: {
        planId: 'scale',
        tier: 'priority',
        priorityRouting: true,
        upgradePlanId: null,
      },
    })
  })

  it('fails an entitlement read error closed to standard support', async () => {
    refs.planError = true
    wire()

    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      supportService: {
        planId: 'free',
        tier: 'standard',
        priorityRouting: false,
        upgradePlanId: 'scale',
      },
    })
  })

  it('ignores submitted tier metadata and persists the server-resolved snapshot', async () => {
    refs.plan = 'pro'
    wire()

    const response = await POST(post({
      ...validTicket,
      supportService: { tier: 'priority' },
      metadata: {
        user_email: 'attacker@example.com',
        source: 'priority_override',
        entitlement_plan_at_submission: 'enterprise',
        support_service_tier_at_submission: 'priority',
        priority_support_at_submission: true,
        harmless_context: 'retained',
      },
    }))

    expect(response.status).toBe(200)
    expect(refs.captured?.payload).toMatchObject({
      owner_id: 'owner-1',
      priority: 'urgent',
      metadata: {
        user_email: 'owner@nexez.test',
        source: 'support_page',
        entitlement_plan_at_submission: 'pro',
        support_service_tier_at_submission: 'standard',
        priority_support_at_submission: false,
        harmless_context: 'retained',
      },
    })
    expect(await response.json()).toMatchObject({
      supportService: { planId: 'pro', tier: 'standard', priorityRouting: false },
    })
  })

  it('keeps urgent incident severity available on Free without granting paid routing', async () => {
    wire()

    const response = await POST(post(validTicket))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(refs.captured?.payload.priority).toBe('urgent')
    expect(body.supportService).toMatchObject({ tier: 'standard', priorityRouting: false })
  })
})
