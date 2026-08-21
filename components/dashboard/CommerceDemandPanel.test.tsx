// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '../../test/dom'
import { CommerceDemandPanel } from './CommerceDemandPanel'

describe('CommerceDemandPanel', () => {
  it('shows directional demand and explicit evidence boundaries', () => {
    render(<CommerceDemandPanel snapshot={{
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
    }} />)

    expect(screen.getByRole('heading', { name: 'Commerce demand signals' })).toBeInTheDocument()
    expect(screen.getByText('Private Chef')).toBeInTheDocument()
    expect(screen.getByText(/directional simulator interactions/i)).toBeInTheDocument()
    expect(screen.getByText(/not conversion evidence/i)).toBeInTheDocument()
    expect(screen.getByText(/No raw buyer queries/i)).toBeInTheDocument()
  })
})
