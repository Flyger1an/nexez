import { describe, expect, it } from 'vitest'
import {
  formatConfiguredOfferLines,
  getOfferReservableResourceTerms,
  mergeProposedOfferPreservingConfiguration,
  parseConfiguredOfferLines,
  withOfferReservableResourceTerms,
  type ConfiguredOfferItem,
} from '../configured-offer'

const POOL = '11111111-1111-4111-8111-111111111111'
const WINDOW = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const offer: ConfiguredOfferItem = {
  name: 'Private dinner',
  description: 'On-site dinner',
  price: '$800',
  url: '',
  customerInputs: [{
    key: 'guest_count',
    label: 'Guest count',
    valueType: 'quantity',
    required: true,
    askBuyer: 'How many guests?',
  }],
}
const terms = {
  schemaVersion: 1 as const,
  requirements: [{
    poolId: POOL,
    windowId: WINDOW,
    quantity: { source: 'input' as const, inputKey: 'guest_count' },
  }],
}

describe('configured offer reservable resources', () => {
  it('round-trips through the legacy editor codec without losing merchant truth', () => {
    const configured = withOfferReservableResourceTerms(offer, terms)
    if (!configured.ok) throw new Error(configured.error)
    const parsed = parseConfiguredOfferLines(formatConfiguredOfferLines([configured.value]))[0]
    expect(getOfferReservableResourceTerms(parsed)).toEqual(terms)
  })

  it('preserves authoritative terms and discards AI-proposed replacements', () => {
    const existing = { ...offer, reservableResourceTerms: terms }
    const proposed = {
      ...offer,
      description: 'Updated copy',
      reservableResourceTerms: {
        schemaVersion: 1,
        requirements: [{ poolId: '22222222-2222-4222-8222-222222222222', quantity: { source: 'fixed', value: 9999 } }],
      },
    } as ConfiguredOfferItem
    expect(mergeProposedOfferPreservingConfiguration(existing, proposed).reservableResourceTerms).toEqual(terms)
  })

  it('refuses to shadow external authority or combine unsupported settlement models', () => {
    expect(withOfferReservableResourceTerms({ ...offer, source: 'calendly' }, terms)).toMatchObject({ ok: false })
    const stagedOffer: ConfiguredOfferItem = { ...offer, stagedSettlementTerms: {
      schemaVersion: 1,
      paymentModel: 'staged-fixed-total',
      approvalPolicy: 'buyer-approves-each-stage',
      mutationPolicy: 'immutable-after-first-payment',
      stages: [
        { id: 'deposit', label: 'Deposit', kind: 'commitment', allocationBps: 5000 },
        { id: 'final', label: 'Final', kind: 'completion', allocationBps: 5000 },
      ],
    } }
    expect(withOfferReservableResourceTerms(stagedOffer, terms)).toMatchObject({ ok: false })
  })
})
