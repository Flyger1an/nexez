import { describe, expect, it } from 'vitest'
import {
  buildMcpBuyerAgent,
  buildMcpDemandRow,
  classifyMcpClient,
  parseMcpBuyerAgent,
  summarizeMcpDemand,
  type McpDemandRow,
} from './mcp-demand'

const attributionId = 'b6bbf40d-79cb-4e3b-9065-88ae5d52687e'

describe('MCP demand evidence', () => {
  it('builds only the categorical persistence allowlist', () => {
    expect(buildMcpDemandRow({
      eventType: 'tool_call',
      toolName: 'nexez_validate_checkout',
      clientFamily: 'claude',
      outcome: 'handled',
      actionReady: true,
      handoffKind: 'checkout',
      attributionId,
    })).toEqual({
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

  it('rejects invalid tool, event, and handoff combinations', () => {
    expect(buildMcpDemandRow({
      eventType: 'tools_list',
      toolName: 'nexez_search',
      clientFamily: 'other',
      outcome: 'handled',
    })).toBeNull()
    expect(buildMcpDemandRow({
      eventType: 'tool_call',
      toolName: 'nexez_search',
      clientFamily: 'other',
      outcome: 'handled',
      handoffKind: 'checkout',
      attributionId,
    })).toBeNull()
  })

  it('maps client names to a bounded family without retaining the name', () => {
    expect(classifyMcpClient('Claude Desktop')).toBe('claude')
    expect(classifyMcpClient('OpenAI ChatGPT Connector')).toBe('chatgpt')
    expect(classifyMcpClient('mcp-inspector')).toBe('mcp_inspector')
    expect(classifyMcpClient('Unrecognized Client 123')).toBe('other')
  })

  it('round-trips the opaque commerce attribution marker', () => {
    const buyerAgent = buildMcpBuyerAgent('cursor', attributionId)
    expect(buyerAgent).toBe(`Nexez MCP/cursor/${attributionId}`)
    expect(parseMcpBuyerAgent(buyerAgent)).toEqual({ family: 'cursor', attributionId })
    expect(parseMcpBuyerAgent('Nexez MCP/cursor/not-a-uuid')).toBeNull()
  })

  it('counts only commerce records tied to an action-ready ledger event', () => {
    const rows: McpDemandRow[] = [
      {
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
      },
      {
        id: 'event-2',
        created_at: '2026-08-25T00:01:00.000Z',
        surface: 'platform_mcp',
        event_type: 'tools_list',
        tool_name: null,
        client_family: 'claude',
        outcome: 'handled',
        action_ready: false,
        handoff_kind: null,
        attribution_id: null,
      },
    ]
    const snapshot = summarizeMcpDemand(
      rows,
      [
        { buyer_agent: `Nexez MCP/claude/${attributionId}`, stripe_livemode: true },
        { buyer_agent: 'Nexez MCP/claude/92be1e24-2836-41db-b66f-71374e64f45e', stripe_livemode: true },
      ],
      '2026-08-25T01:00:00.000Z',
      '2026-07-26T01:00:00.000Z',
      { status: 'published', version: '1.1.0', detail: 'Published.' },
      { status: 'ready', protocolVersion: '2026-07-28', detail: 'Ready.' },
    )
    expect(snapshot).toMatchObject({
      totalCalls: 2,
      toolCalls: 1,
      actionReady: 1,
      attributedCommerce: 1,
      liveCommerce: 1,
    })
  })
})
