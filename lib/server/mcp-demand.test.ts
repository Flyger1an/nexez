import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../test/supabase-mock'
import type { McpDemandRow } from '../mcp-demand'

const refs = vi.hoisted(() => ({
  hasAdmin: true,
  operations: [] as QueryContext[],
  events: [] as McpDemandRow[],
  orders: [] as Array<{ buyer_agent: string | null; stripe_livemode: boolean | null }>,
  negotiations: [] as Array<{ buyer_agent: string | null; stripe_livemode: boolean | null }>,
}))

vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: () => refs.hasAdmin,
  createAdminClient: () => createSupabaseMock((context) => {
    refs.operations.push(context)
    if (context.table === 'mcp_demand_events' && context.op === 'select') return { data: refs.events, error: null }
    if (context.table === 'checkout_orders' && context.op === 'select') return { data: refs.orders, error: null }
    if (context.table === 'agent_negotiations' && context.op === 'select') return { data: refs.negotiations, error: null }
    return { data: null, error: null }
  }),
}))
vi.mock('../observability', () => ({ captureError: vi.fn() }))
vi.mock('next/server', () => ({ after: (callback: () => unknown) => callback() }))

import {
  getMcpDemandSnapshot,
  persistMcpDemandEvent,
  scheduleMcpDemandEvent,
} from './mcp-demand'

const attributionId = 'b6bbf40d-79cb-4e3b-9065-88ae5d52687e'

describe('server MCP demand evidence', () => {
  beforeEach(() => {
    refs.hasAdmin = true
    refs.operations = []
    refs.events = []
    refs.orders = []
    refs.negotiations = []
    vi.stubGlobal('fetch', vi.fn(async (url: unknown) => {
      if (String(url).includes('registry.modelcontextprotocol.io')) {
        return new Response(JSON.stringify({
          servers: [{
            server: {
              name: 'ai.nexez/commerce',
              version: '1.1.0',
              remotes: [{ type: 'streamable-http', url: 'https://nexez.app/mcp' }],
            },
          }],
        }), { status: 200 })
      }
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: 'launch-control-discover',
        result: {
          resultType: 'complete',
          supportedVersions: ['2026-07-28'],
          capabilities: { tools: {}, resources: {} },
        },
      }), { status: 200 })
    }))
  })

  it('persists only the controlled event row', async () => {
    await persistMcpDemandEvent({
      eventType: 'tool_call',
      toolName: 'nexez_validate_checkout',
      clientFamily: 'claude',
      outcome: 'handled',
      actionReady: true,
      handoffKind: 'checkout',
      attributionId,
    })
    const insert = refs.operations.find((operation) => operation.op === 'insert')
    expect(insert?.table).toBe('mcp_demand_events')
    expect(insert?.payload).toEqual({
      surface: 'platform_mcp',
      event_type: 'tool_call',
      tool_name: 'nexez_validate_checkout',
      client_family: 'claude',
      outcome: 'handled',
      action_ready: true,
      handoff_kind: 'checkout',
      attribution_id: attributionId,
    })
  })

  it('schedules persistence after the response boundary', async () => {
    scheduleMcpDemandEvent({
      eventType: 'tools_list',
      clientFamily: 'other',
      outcome: 'handled',
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(refs.operations.some((operation) => operation.op === 'insert')).toBe(true)
  })

  it('separates registry, endpoint, request, handoff, and commerce proof', async () => {
    refs.events = [{
      id: 'event-1',
      created_at: '2026-08-25T00:00:00.000Z',
      surface: 'platform_mcp',
      event_type: 'tool_call',
      tool_name: 'nexez_validate_checkout',
      client_family: 'claude',
      outcome: 'handled',
      action_ready: true,
      handoff_kind: 'checkout',
      attribution_id: attributionId,
    }]
    refs.orders = [{
      buyer_agent: `Nexez MCP/claude/${attributionId}`,
      stripe_livemode: true,
    }]
    await expect(getMcpDemandSnapshot()).resolves.toMatchObject({
      available: true,
      totalCalls: 1,
      actionReady: 1,
      attributedCommerce: 1,
      liveCommerce: 1,
      registry: { status: 'published', version: '1.1.0' },
      endpoint: { status: 'ready', protocolVersion: '2026-07-28' },
    })
  })

  it('keeps live checks visible when the private evidence store is unavailable', async () => {
    refs.hasAdmin = false
    await expect(getMcpDemandSnapshot()).resolves.toMatchObject({
      available: false,
      totalCalls: 0,
      registry: { status: 'published' },
      endpoint: { status: 'ready' },
    })
    expect(refs.operations).toEqual([])
  })
})
