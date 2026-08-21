import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createSupabaseMock, type QueryContext } from '../../../../test/supabase-mock'

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }))
vi.mock('../../../../utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('../../../../lib/server/plan', () => ({ getOwnerPlanId: vi.fn(async () => 'pro') }))
vi.mock('../../../../lib/billing', () => ({ planAllows: vi.fn(() => true) }))

import { GET } from './route'
import { createClient } from '../../../../utils/supabase/server'

const request = (query = '') => new NextRequest(`https://nexez.test/api/analytics/export${query}`)

const event = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  page_id: 'page-1',
  owner_id: 'owner-1',
  slug: 'acme',
  offer_key: 'services-0',
  offer_name: 'Strategy',
  offer_kind: 'services',
  event_type: 'checkout_attempt',
  agent_user_agent: 'GPTBot',
  referrer: null,
  query: 'strategy',
  checkout_url: null,
  provider_url: null,
  stripe_session_id: null,
  metadata: {},
  trust_level: 'verified_server',
  ingestion_source: 'checkout',
  created_at: '2026-08-21T10:00:00Z',
  ...over,
})

function withData(handler: (context: QueryContext) => { data?: any; error?: any }, user: any = { id: 'owner-1' }) {
  vi.mocked(createClient).mockReturnValue(createSupabaseMock(handler, { user }) as any)
}

describe('GET /api/analytics/export', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires an authenticated owner', async () => {
    withData(() => ({ data: [], error: null }), null)
    expect((await GET(request())).status).toBe(401)
  })

  it('exports activity, visits, and live paid orders with provenance', async () => {
    withData((context) => {
      if (context.table === 'checkout_events') return { data: [event('event-1')], error: null }
      if (context.table === 'agent_visits') return { data: [{
        id: 'visit-1', page_id: 'page-1', owner_id: 'owner-1', slug: 'acme', path: '/acme', referrer: null,
        query: 'strategy', user_agent: 'GPTBot', ip_hash: null, is_ai_agent: true, agent_type: 'ChatGPT-Agent',
        confidence_score: 99, detection_signals: {}, trust_level: 'verified_server', ingestion_source: 'page',
        created_at: '2026-08-21T09:00:00Z',
      }], error: null }
      if (context.table === 'checkout_orders') return { data: [{
        id: 'order-1', page_id: 'page-1', status: 'paid', channel: 'acp', amount_cents: 1000,
        currency: 'usd', stripe_livemode: true, created_at: '2026-08-21T11:00:00Z', slug: 'acme',
        offer_name: 'Strategy', buyer_agent: 'ChatGPT',
      }], error: null }
      return { data: [], error: null }
    })

    const response = await GET(request('?range=7d&page=page-1&traffic=ai'))
    const csv = await response.text()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toContain('nexez-analytics-')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(csv).toContain('activity_event')
    expect(csv).toContain('traffic_visit')
    expect(csv).toContain('paid_order')
    expect(csv).toContain('verified_server')
  })

  it('paginates past the previous 1,000-row silent ceiling', async () => {
    withData((context) => {
      if (context.table !== 'checkout_events') return { data: [], error: null }
      const range = context.calls.find(([method]) => method === 'range')
      const from = Number(range?.[1] ?? 0)
      if (from === 0) return { data: Array.from({ length: 1000 }, (_, index) => event(`event-${index}`)), error: null }
      if (from === 1000) return { data: [event('event-1000')], error: null }
      return { data: [], error: null }
    })

    const response = await GET(request('?range=30d'))
    const csv = await response.text()
    expect(response.status).toBe(200)
    expect(csv.split('\n')).toHaveLength(1002)
  })

  it('returns an explicit failure instead of a partial CSV when any source fails', async () => {
    withData((context) => context.table === 'agent_visits'
      ? { data: null, error: { code: 'DB_DOWN' } }
      : { data: [], error: null })
    const response = await GET(request())
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Could not export analytics.' })
  })
})
