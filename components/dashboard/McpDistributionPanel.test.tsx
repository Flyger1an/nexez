// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '../../test/dom'
import type { McpDemandSnapshot } from '../../lib/mcp-demand'
import { McpDistributionPanel } from './McpDistributionPanel'

describe('McpDistributionPanel', () => {
  it('keeps distribution, demand, handoff, and money proof distinct', () => {
    const snapshot: McpDemandSnapshot = {
      generatedAt: '2026-08-25T01:00:00.000Z',
      since: '2026-07-26T01:00:00.000Z',
      available: true,
      truncated: false,
      totalCalls: 12,
      toolCalls: 8,
      actionReady: 3,
      attributedCommerce: 2,
      liveCommerce: 1,
      clients: [{ family: 'claude', calls: 12 }],
      tools: [{ name: 'nexez_validate_checkout', calls: 3, actionReady: 3 }],
      registry: { status: 'published', version: '1.1.0', detail: 'Published.' },
      endpoint: { status: 'ready', protocolVersion: '2026-07-28', detail: 'Ready.' },
    }
    render(<McpDistributionPanel snapshot={snapshot} />)

    expect(screen.getByRole('heading', { name: 'External agent reach' })).toBeInTheDocument()
    expect(screen.getByText(/listed in a registry does not count as a customer or sale/i)).toBeInTheDocument()
    expect(screen.getAllByText('12')).toHaveLength(2)
    expect(screen.getAllByText('3')).toHaveLength(2)
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText(/does not store prompts, request text, buyer details/i)).toBeInTheDocument()
  })
})
