import { describe, expect, it } from 'vitest'
import {
  buildCommerceDemandSignalRow,
  summarizeCommerceDemandSignals,
  type CommerceDemandSignalRow,
} from './commerce-demand'
import { commerceReferenceCandidates } from './commerce-templates/curation'

describe('Commerce demand signals', () => {
  it('builds an allowlisted row without buyer, merchant, or request text', () => {
    const row = buildCommerceDemandSignalRow({
      mode: 'simulation',
      intent: 'booking',
      reference: {
        id: 'events.private-chef',
        domain: 'events-hospitality',
      },
    })

    expect(row).toEqual({
      surface: 'homepage_simulator',
      mode: 'simulation',
      intent: 'booking',
      reference_id: 'events.private-chef',
      reference_domain: 'events-hospitality',
    })
    expect(Object.keys(row ?? {})).not.toEqual(expect.arrayContaining([
      'query',
      'request_label',
      'merchant',
      'location',
      'user_id',
      'session_id',
      'ip',
      'user_agent',
    ]))
  })

  it('stores an unmapped coverage gap without free-text category data', () => {
    expect(buildCommerceDemandSignalRow({
      mode: 'coverage_gap',
      intent: 'overview',
      reference: {
        id: 'events.private-chef',
        domain: 'events-hospitality',
      },
    })).toEqual({
      surface: 'homepage_simulator',
      mode: 'coverage_gap',
      intent: 'overview',
      reference_id: null,
      reference_domain: null,
    })
  })

  it('rejects malformed canonical references and impossible simulations', () => {
    expect(buildCommerceDemandSignalRow({
      mode: 'simulation',
      intent: 'booking',
      reference: null,
    })).toBeNull()
    expect(buildCommerceDemandSignalRow({
      mode: 'marketplace',
      intent: 'booking',
      reference: {
        id: '../buyer-query',
        domain: 'events-hospitality',
      },
    })).toMatchObject({ reference_id: null, reference_domain: null })
  })

  it('ranks mapped categories by unresolved supply while separating uncovered requests', () => {
    const rows: CommerceDemandSignalRow[] = [
      signal('simulation', 'events.private-chef'),
      signal('simulation', 'events.private-chef'),
      signal('marketplace', 'events.private-chef'),
      signal('partial_match', 'events.party-rentals'),
      signal('simulation', 'events.party-rentals'),
      signal('coverage_gap', null),
    ]

    const snapshot = summarizeCommerceDemandSignals(
      rows,
      commerceReferenceCandidates,
      '2026-08-21T16:00:00.000Z',
      '2026-07-22T16:00:00.000Z',
    )

    expect(snapshot).toMatchObject({
      available: true,
      truncated: false,
      totalSignals: 6,
      mappedSignals: 5,
      liveMatches: 1,
      relatedMatches: 1,
      referenceMatches: 3,
      coverageGaps: 1,
    })
    expect(snapshot.categories.map((category) => category.referenceId)).toEqual([
      'events.private-chef',
      'events.party-rentals',
    ])
    expect(snapshot.categories[0]).toMatchObject({
      title: 'Private Chef',
      observed: 3,
      live: 1,
      related: 0,
      reference: 2,
      unresolved: 2,
    })
  })
})

function signal(
  mode: CommerceDemandSignalRow['mode'],
  referenceId: string | null,
): CommerceDemandSignalRow {
  const candidate = commerceReferenceCandidates.find((item) => item.id === referenceId)
  return {
    id: crypto.randomUUID(),
    created_at: '2026-08-21T15:00:00.000Z',
    surface: 'homepage_simulator',
    mode,
    intent: 'booking',
    reference_id: referenceId,
    reference_domain: candidate?.domain ?? null,
  }
}
