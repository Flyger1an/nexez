import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../test/supabase-mock'

const { state } = vi.hoisted(() => ({
  state: { contexts: [] as QueryContext[], keys: new Set<string>() },
}))

vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: () => true,
  createAdminClient: () => createSupabaseMock((ctx) => {
    state.contexts.push(ctx)
    const key = String((ctx.payload as any)?.ingestion_key || '')
    if (state.keys.has(key)) return { data: null, error: { code: '23505', message: 'duplicate' } }
    state.keys.add(key)
    return { data: null, error: null }
  }),
}))
vi.mock('../supabase', () => ({ supabase: { from: vi.fn() } }))

import { insertVerifiedAgentVisit, insertVerifiedCheckoutEvent } from './analytics-ingestion'

describe('verified analytics ingestion', () => {
  beforeEach(() => {
    state.contexts.length = 0
    state.keys.clear()
  })

  it('stamps server provenance and collapses an exact replay', async () => {
    const event = {
      page_id: 'p1',
      owner_id: 'o1',
      slug: 'demo',
      offer_key: 'services-0',
      offer_name: 'Consult',
      offer_kind: 'services' as const,
      event_type: 'checkout_attempt' as const,
      agent_user_agent: 'Agent/1.0',
      metadata: { source: 'checkout_runtime' },
    }
    const options = { source: 'checkout_runtime', replayKey: 'request-1', now: 100_000 }
    expect(await insertVerifiedCheckoutEvent(event, options)).toMatchObject({ ok: true, replayed: false })
    expect(await insertVerifiedCheckoutEvent(event, options)).toMatchObject({ ok: true, replayed: true })

    const payload = state.contexts[0]!.payload as any
    expect(payload.trust_level).toBe('verified_server')
    expect(payload.ingestion_source).toBe('checkout_runtime')
    expect(payload.ingestion_key).toMatch(/^[0-9a-f]{64}$/)
  })

  it('deduplicates repeat visits in the same privacy-safe time bucket', async () => {
    const visit = {
      page_id: 'p1',
      owner_id: 'o1',
      slug: 'demo',
      path: '/demo',
      user_agent: 'GPTBot',
      ip_hash: 'abc',
      is_ai_agent: true,
      agent_type: 'ChatGPT / OpenAI',
      confidence_score: 99,
    }
    expect(await insertVerifiedAgentVisit(visit, { source: 'public_agent_page', now: 120_000 })).toMatchObject({ replayed: false })
    expect(await insertVerifiedAgentVisit(visit, { source: 'public_agent_page', now: 125_000 })).toMatchObject({ replayed: true })
  })
})
