import { describe, expect, it } from 'vitest'
import { buildAgentOfferConfiguration } from '../agent-offer-configuration'
import { buildAgentPagePayload } from '../agent-manifest'
import type { AgentPage } from '../agent-page'
import { handleMcpRequest } from '../mcp-server'
import {
  formatConfiguredOfferLines,
  getOfferStagedSettlementTerms,
  mergeProposedOfferPreservingConfiguration,
  parseConfiguredOfferLines,
  withOfferRecurringTerms,
  withOfferStagedSettlementTerms,
} from '../configured-offer'
import type { StagedSettlementTerms } from '../staged-settlement'

const stagedTerms: StagedSettlementTerms = {
  schemaVersion: 1,
  paymentModel: 'staged-fixed-total',
  approvalPolicy: 'buyer-approves-each-stage',
  mutationPolicy: 'immutable-after-first-payment',
  stages: [
    { id: 'kickoff', label: 'Kickoff installment', kind: 'commitment', allocationBps: 3000 },
    { id: 'handoff', label: 'Final handoff', kind: 'completion', allocationBps: 7000 },
  ],
}

const offer = {
  name: 'Web Design Project',
  description: 'A scoped project.',
  price: '$10,000',
  url: '',
  stagedSettlementTerms: stagedTerms,
} as any

describe('staged settlement offer integration', () => {
  it('round-trips merchant terms through configured offer persistence', () => {
    const encoded = formatConfiguredOfferLines([offer])
    expect(encoded).toContain('[[STAGED_SETTLEMENT]]')

    const parsed = parseConfiguredOfferLines(encoded)[0]!
    expect(getOfferStagedSettlementTerms(parsed)).toEqual(stagedTerms)
  })

  it('preserves merchant schedule truth across model-proposed offer edits', () => {
    const merged = mergeProposedOfferPreservingConfiguration(offer, {
      name: 'Web Design Project',
      description: 'AI rewrote this description.',
      price: '$12,000',
      url: '',
      stagedSettlementTerms: {
        ...stagedTerms,
        stages: [
          { id: 'fake', label: 'Pay everything', kind: 'commitment', allocationBps: 9999 },
          { id: 'fake-end', label: 'Done', kind: 'completion', allocationBps: 1 },
        ],
      },
    } as any)

    expect(merged.description).toBe('AI rewrote this description.')
    expect(getOfferStagedSettlementTerms(merged)).toEqual(stagedTerms)
  })

  it('prevents finite staged and open-ended recurring contracts from sharing one offer', () => {
    const recurring = {
      schemaVersion: 1,
      paymentModel: 'fixed-per-period',
      schedule: { mode: 'fixed', cadence: { interval: 'month', intervalCount: 1 } },
      startPolicy: 'first-successful-payment',
      endPolicy: 'until-cancelled',
      cancellationPolicy: 'period-end',
      pausePolicy: 'unsupported',
    }
    expect(withOfferRecurringTerms(offer, recurring)).toMatchObject({ ok: false })
    expect(withOfferStagedSettlementTerms({ ...offer, stagedSettlementTerms: undefined, recurringTerms: recurring } as any, stagedTerms))
      .toMatchObject({ ok: false })
  })

  it('publishes the exact schedule while clearly blocking unsupported capture', () => {
    const contract = buildAgentOfferConfiguration(offer) as any

    expect(contract.staged_settlement).toMatchObject({
      schema_version: 1,
      terms: stagedTerms,
      runtime_status: 'contract-only',
      checkout_supported: false,
    })
    expect(contract.checkout.status).toBe('blocked_pending_staged_settlement_runtime')
    expect(contract.checkout.staged_settlement_requires_nexez_settlement).toBe(true)
    expect(contract.checkout.runtime_readiness_check).toBeNull()
    expect(contract.checkout.note).toContain('fails closed')
  })

  it('removes payable checkout actions from agent.json until staged capture exists', () => {
    const page = {
      id: 'p1',
      owner_id: 'o1',
      slug: 'studio',
      name: 'Studio',
      description: 'Projects',
      services: [offer],
      products: [],
      faqs: [],
      is_published: true,
    } as unknown as AgentPage
    const payload = buildAgentPagePayload(page, 'https://nexez.test') as any
    const published = payload.offers[0]

    expect(published.checkout_url).toBeNull()
    expect(published.action).toEqual({
      available: false,
      reason: expect.stringContaining('Do not charge the full offer total'),
    })
    expect(published.configuration.staged_settlement.terms).toEqual(stagedTerms)
    expect(payload.recommended_actions[0]).toContain('No offer currently exposes a payable checkout action')
  })

  it('keeps MCP from returning a staged offer as a booking target', () => {
    const page = {
      id: 'p1',
      owner_id: 'o1',
      slug: 'studio',
      name: 'Studio',
      services: [offer],
      products: [],
    } as unknown as AgentPage
    const response = handleMcpRequest(page, 'https://nexez.test', {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'book_offer', arguments: { offer: 'services-0' } },
    }) as any

    expect(response.result.content[0].text).toContain('Checkout is unavailable')
    expect(response.result.content[0].text).not.toContain('/checkout/studio')
  })
})
