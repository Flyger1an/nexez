import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import manifest from './v1.manifest.json'
import {
  NEXXI_CONTRACT_VERSION,
  NexxiTurnResponseSchema,
  parseNexxiCards,
  parseNexxiTurnResponse,
} from './v1'

const model = { configured: true, provider: 'test', name: 'test-model' }

function currentResponse() {
  return {
    ok: true,
    contractVersion: NEXXI_CONTRACT_VERSION,
    threadId: 'thread-1',
    agentId: 'agent-1',
    message: 'Found one.',
    cards: [{
      type: 'page_result',
      id: 'demo:services-0',
      title: 'Consultation',
      subtitle: 'Demo',
      description: null,
      price: '$100',
      slug: 'demo',
      url: 'https://nexez.test/demo',
      agentJsonUrl: 'https://nexez.test/demo/agent.json',
      offerKey: 'services-0',
      offerName: 'Consultation',
      checkoutUrl: 'https://nexez.test/checkout/demo?offer=services-0',
      score: 10,
      commerce: {
        state: 'actionable',
        rail: 'one_time',
        reasonCode: 'supported',
        message: 'Nexxi can prepare this checkout handoff for your approval.',
      },
    }],
    suggestions: [],
    toolsUsed: ['search_pages'],
    memory: {},
    model,
  }
}

describe('Nexxi v1 wire contract', () => {
  it('matches the published source fingerprint consumed by clients', () => {
    const source = readFileSync(join(process.cwd(), 'contracts', 'nexxi', 'v1.ts'))
    expect(createHash('sha256').update(source).digest('hex')).toBe(manifest.sha256)
    expect(manifest).toMatchObject({ contract: 'nexxi', version: NEXXI_CONTRACT_VERSION })
  })

  it('validates the current versioned response', () => {
    const response = currentResponse()
    expect(NexxiTurnResponseSchema.parse(response)).toEqual(response)
    expect(parseNexxiTurnResponse(response).cards[0]).toMatchObject({
      commerce: { state: 'actionable', rail: 'one_time' },
    })
  })

  it('accepts legacy turns only as view-only commerce', () => {
    const legacy = currentResponse() as any
    delete legacy.contractVersion
    delete legacy.cards[0].commerce

    expect(parseNexxiTurnResponse(legacy)).toMatchObject({
      contractVersion: 1,
      cards: [{ commerce: { state: 'view_only', rail: 'unknown', reasonCode: 'legacy_contract' } }],
    })
  })

  it('keeps known legacy negotiations actionable but blocks legacy bookings', () => {
    const base = {
      type: 'approval',
      id: 'approval-1',
      status: 'PENDING',
      title: 'Approve action',
      summary: 'Review the action.',
      payload: {},
    }
    const cards = parseNexxiCards([
      { ...base, toolName: 'initiate_negotiation' },
      { ...base, id: 'approval-2', toolName: 'trigger_booking' },
    ])

    expect(cards[0]).toMatchObject({ commerce: { state: 'actionable', rail: 'negotiation' } })
    expect(cards[1]).toMatchObject({ commerce: { state: 'view_only', reasonCode: 'legacy_contract' } })
  })

  it('drops malformed and unknown persisted cards', () => {
    expect(parseNexxiCards([
      { type: 'mystery', id: '1' },
      { type: 'approval', id: '', toolName: 'trigger_booking' },
    ])).toEqual([])
  })
})
