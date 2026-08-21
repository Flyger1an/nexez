import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommerceDemandSnapshot } from '../commerce-demand'

const state = vi.hoisted(() => ({
  hasEnv: true,
  campaignRows: [] as unknown[],
  campaignError: null as null | { code?: string; message?: string },
  rpcData: null as null | Record<string, unknown>,
  rpcError: null as null | { code?: string; message?: string },
  rpcArgs: null as null | Record<string, unknown>,
  demand: null as CommerceDemandSnapshot | null,
}))

function client() {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => ({
            returns: vi.fn(async () => ({ data: state.campaignRows, error: state.campaignError })),
          })),
        })),
      })),
    })),
    rpc: vi.fn((_name: string, args: Record<string, unknown>) => {
      state.rpcArgs = args
      return {
        single: vi.fn(async () => ({ data: state.rpcData, error: state.rpcError })),
      }
    }),
  }
}
vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: vi.fn(() => state.hasEnv),
  createAdminClient: vi.fn(() => client()),
}))
vi.mock('./commerce-demand', () => ({
  getCommerceDemandSnapshot: vi.fn(async () => state.demand),
}))
vi.mock('../observability', () => ({ captureError: vi.fn() }))

import {
  applyCommerceSupplyCampaign,
  CommerceSupplyCampaignError,
  getCommerceSupplyWorkflowSnapshot,
} from './commerce-supply-workflow'

describe('server Commerce supply workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.hasEnv = true
    state.campaignRows = []
    state.campaignError = null
    state.rpcData = null
    state.rpcError = null
    state.rpcArgs = null
    state.demand = demand()
  })

  it('degrades to readable, non-persistent briefs when server persistence is unavailable', async () => {
    state.hasEnv = false
    const snapshot = await getCommerceSupplyWorkflowSnapshot(demand(), marketplace())
    expect(snapshot.available).toBe(false)
    expect(snapshot.items[0]).toMatchObject({ referenceId: 'events.private-chef', status: 'new' })
  })

  it('maps persisted operator state onto the current directional priority', async () => {
    state.campaignRows = [{
      reference_id: 'events.private-chef',
      reference_domain: 'events-hospitality',
      status: 'contacted',
      decision_reason: 'Two merchants contacted',
      created_by: 'admin-1',
      updated_by: 'admin-1',
      created_at: '2026-08-21T00:00:00.000Z',
      updated_at: '2026-08-21T01:00:00.000Z',
    }]
    const snapshot = await getCommerceSupplyWorkflowSnapshot(demand(), marketplace())
    expect(snapshot.available).toBe(true)
    expect(snapshot.items[0]).toMatchObject({ status: 'contacted', campaign: { decisionReason: 'Two merchants contacted' } })
  })

  it('derives audit evidence from the server snapshot before calling the bounded RPC', async () => {
    state.rpcData = {
      reference_id: 'events.private-chef',
      reference_domain: 'events-hospitality',
      status: 'sourcing',
      decision_reason: 'Recruit two qualified operators',
      created_by: 'admin-1',
      updated_by: 'admin-1',
      created_at: '2026-08-21T00:00:00.000Z',
      updated_at: '2026-08-21T00:00:00.000Z',
    }
    const campaign = await applyCommerceSupplyCampaign({
      referenceId: 'events.private-chef',
      status: 'sourcing',
      reason: 'Recruit two qualified operators',
      actorId: 'admin-1',
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
    })

    expect(campaign.status).toBe('sourcing')
    expect(state.rpcArgs).toMatchObject({
      p_reference_id: 'events.private-chef',
      p_reference_domain: 'events-hospitality',
      p_observed_count: 4,
      p_live_count: 0,
      p_related_count: 1,
      p_reference_count: 3,
      p_unresolved_count: 4,
    })
    expect(Object.keys(state.rpcArgs ?? {})).not.toContain('raw_query')
  })

  it('refuses to mutate a category that is no longer an unresolved priority', async () => {
    state.demand = { ...demand(), categories: [] }
    await expect(applyCommerceSupplyCampaign({
      referenceId: 'events.private-chef',
      status: 'sourcing',
      reason: 'Stale action',
      actorId: 'admin-1',
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
    })).rejects.toMatchObject({ code: 'not_found' })
  })

  it('maps database transition and idempotency errors without exposing internals', async () => {
    state.rpcError = { code: '22023', message: 'invalid campaign transition from new to onboarding' }
    await expect(applyCommerceSupplyCampaign({
      referenceId: 'events.private-chef',
      status: 'onboarding',
      reason: 'Skip steps',
      actorId: 'admin-1',
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
    })).rejects.toEqual(expect.objectContaining<Partial<CommerceSupplyCampaignError>>({ code: 'invalid' }))
  })
})

function demand(): CommerceDemandSnapshot {
  return {
    generatedAt: '2026-08-21T12:00:00.000Z',
    since: '2026-07-22T12:00:00.000Z',
    available: true,
    truncated: false,
    totalSignals: 4,
    mappedSignals: 4,
    liveMatches: 0,
    relatedMatches: 1,
    referenceMatches: 3,
    coverageGaps: 0,
    categories: [{
      referenceId: 'events.private-chef',
      title: 'Private Chef',
      domain: 'events-hospitality',
      observed: 4,
      live: 0,
      related: 1,
      reference: 3,
      unresolved: 4,
    }],
  }
}

function marketplace() {
  return {
    generatedAt: '2026-08-21T12:00:00.000Z',
    available: true,
    items: [],
    summary: {
      total: 0,
      unreviewed: 0,
      candidate: 0,
      certified: 0,
      excluded: 0,
      blockers: 0,
      warnings: 0,
    },
  }
}
