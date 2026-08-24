// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '../../test/dom'
import type { CommerceDemandSnapshot } from '../../lib/commerce-demand'
import { CommerceDemandPanel } from './CommerceDemandPanel'

describe('CommerceDemandPanel', () => {
  it('shows directional demand and explicit evidence boundaries', () => {
    const demand: CommerceDemandSnapshot = {
      generatedAt: '2026-08-21T16:00:00.000Z',
      since: '2026-07-22T16:00:00.000Z',
      available: true,
      truncated: false,
      totalSignals: 6,
      mappedSignals: 5,
      liveMatches: 1,
      relatedMatches: 1,
      referenceMatches: 3,
      coverageGaps: 1,
      categories: [{
        referenceId: 'events.private-chef',
        title: 'Private Chef',
        domain: 'events-hospitality',
        observed: 3,
        live: 1,
        related: 0,
        reference: 2,
        unresolved: 2,
      }],
    }
    render(<CommerceDemandPanel
      snapshot={demand}
      supplyWorkflow={{
        generatedAt: demand.generatedAt,
        available: true,
        demandAvailable: true,
        verificationAvailable: true,
        items: [{
          rank: 1,
          referenceId: 'events.private-chef',
          title: 'Private Chef',
          domain: 'events-hospitality',
          lifecycle: 'active-template',
          lifecycleLabel: 'Active template',
          basis: 'observed-demand',
          basisLabel: 'Observed demand',
          action: 'recruit-exact-supply',
          actionLabel: 'Recruit exact supply',
          rationale: 'Reference behavior was required.',
          observed: 3,
          live: 1,
          related: 0,
          reference: 2,
          unresolved: 2,
          campaign: null,
          status: 'new',
          certifiedSupply: [],
          brief: {
            objective: 'Recruit a real Private Chef merchant.',
            merchantProfile: 'On-location chef service.',
            verificationQuestions: ['What area do you serve?'],
            capabilityTags: ['QUOTE_REQUIRED'],
            successBoundary: 'Certification does not prove location or availability.',
          },
        }],
      }}
    />)

    expect(screen.getByRole('heading', { name: 'What customers are looking for' })).toBeInTheDocument()
    expect(screen.getAllByText('Private Chef')).toHaveLength(2)
    expect(screen.getByText(/services people searched for in the simulator/i)).toBeInTheDocument()
    expect(screen.getByText(/do not represent completed sales/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Seller recruitment priorities' })).toBeInTheDocument()
    expect(screen.getByText('Recruit exact supply')).toBeInTheDocument()
    expect(screen.getByText(/Progress changes only when someone updates it/i)).toBeInTheDocument()
    expect(screen.getByText(/1 search does not match a service category yet/i)).toBeInTheDocument()
    expect(screen.getByText(/This report stores totals only/i)).toBeInTheDocument()
  })
})
