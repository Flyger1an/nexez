import { describe, expect, it } from 'vitest'
import { buildPublicSimulatorDecisionPath } from '../public-simulator'

describe('buildPublicSimulatorDecisionPath', () => {
  it('makes a live merchant action explicit without claiming confirmation', () => {
    const path = buildPublicSimulatorDecisionPath({
      mode: 'marketplace',
      intentLabel: 'Booking intent',
      merchantName: 'Kismet Pros',
      offerName: 'Moving Cleaning',
      checkoutUrl: 'https://nexez.test/checkout/kismetpros/services-1',
    })

    expect(path).toHaveLength(4)
    expect(path.map((step) => step.key)).toEqual(['intent', 'supply', 'commerce', 'action'])
    expect(path[1]).toMatchObject({ status: 'live', detail: 'Kismet Pros' })
    expect(path[3]).toMatchObject({
      status: 'actionable',
      label: 'Merchant action path available',
    })
    expect(JSON.stringify(path)).not.toMatch(/confirmed|guaranteed/i)
  })

  it('requires verification when related supply is incomplete', () => {
    const path = buildPublicSimulatorDecisionPath({
      mode: 'partial_match',
      intentLabel: 'Booking intent',
      merchantName: 'Austin Event Planners',
      offerName: 'General Event Planning',
    })

    expect(path[1]).toMatchObject({ status: 'related', label: 'Related marketplace supply' })
    expect(path[2]?.detail).toContain('does not establish the complete request')
    expect(path[3]).toMatchObject({ status: 'verify', label: 'Merchant confirmation required' })
  })

  it('shows a library match as understood commerce rather than live supply', () => {
    const path = buildPublicSimulatorDecisionPath({
      mode: 'simulation',
      intentLabel: 'Service request',
      referenceTitle: 'Private Chef',
    })

    expect(path[1]).toMatchObject({ status: 'checked', label: 'Live marketplace checked' })
    expect(path[2]).toMatchObject({ status: 'reference', label: 'Commerce behavior understood' })
    expect(path[3]).toMatchObject({ status: 'protected', label: 'Real merchant required' })
    expect(path[3]?.detail).toContain('No price, availability, inventory, or booking was invented')
  })

  it('preserves an uncovered request instead of substituting another service', () => {
    const path = buildPublicSimulatorDecisionPath({
      mode: 'coverage_gap',
      intentLabel: 'Service request',
      requestLabel: 'Mobile notary',
    })

    expect(path[0]).toMatchObject({ status: 'understood', detail: 'Mobile notary' })
    expect(path[1]).toMatchObject({ status: 'checked', label: 'Live marketplace searched' })
    expect(path[2]).toMatchObject({ status: 'checked', label: 'Commerce Library searched' })
    expect(path[3]).toMatchObject({ status: 'protected', label: 'Buyer intent preserved' })
  })
})
