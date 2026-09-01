import { beforeEach, describe, expect, it, vi } from 'vitest'

const { readinessRef } = vi.hoisted(() => ({
  readinessRef: { checkoutReadySlugs: new Set<string>() },
}))

vi.mock('../server/public-commerce-capabilities', () => ({
  resolvePublicCommerceCapabilities: vi.fn(async () => ({
    negotiationEligibleSlugs: new Set<string>(),
    checkoutReadySlugs: readinessRef.checkoutReadySlugs,
  })),
}))

import {
  commerceCapabilityForSearchResult,
  resolveNexxiBookingCapability,
} from './nexxi-commerce'

function page(services: any[], slug = 'demo') {
  return {
    id: slug,
    name: 'Demo',
    slug,
    is_published: true,
    services,
    products: [],
    faqs: [],
  } as any
}

function dbFor(value: any) {
  const query: any = {}
  for (const method of ['select', 'eq']) query[method] = vi.fn(() => query)
  query.maybeSingle = vi.fn(async () => ({ data: value, error: null }))
  return { from: vi.fn(() => query) } as any
}

beforeEach(() => {
  readinessRef.checkoutReadySlugs = new Set(['demo'])
})

describe('Nexxi commerce launch guard', () => {
  it('allows only a ready legacy one-time checkout', async () => {
    const capability = await resolveNexxiBookingCapability(
      dbFor(page([{ name: 'Consultation', price: '$100', url: '' }])),
      { slug: 'demo', offer: 'services-0' },
    )
    expect(capability).toMatchObject({ state: 'actionable', rail: 'one_time', reasonCode: 'supported' })
  })

  it('allows configured, recurring, staged, and reservable offers into authoritative preparation', async () => {
    const variants = [
      {
        expected: 'configured',
        offer: {
          name: 'Configured',
          price: '$100',
          url: '',
          customerInputs: [{ key: 'size', label: 'Size', valueType: 'quantity', required: true, askBuyer: 'What size?' }],
        },
      },
      {
        expected: 'recurring',
        offer: {
          name: 'Recurring',
          price: '$100',
          url: '',
          recurringTerms: {
            schemaVersion: 1,
            paymentModel: 'fixed-per-period',
            schedule: { mode: 'fixed', cadence: { interval: 'month', intervalCount: 1 } },
            startPolicy: 'first-successful-payment',
            endPolicy: 'until-cancelled',
            cancellationPolicy: 'period-end',
            pausePolicy: 'unsupported',
          },
        },
      },
      {
        expected: 'staged',
        offer: {
          name: 'Staged',
          price: '$100',
          url: '',
          stagedSettlementTerms: {
            schemaVersion: 1,
            paymentModel: 'staged-fixed-total',
            approvalPolicy: 'buyer-approves-each-stage',
            mutationPolicy: 'immutable-after-first-payment',
            stages: [
              { id: 'deposit', label: 'Deposit', kind: 'commitment', allocationBps: 5000 },
              { id: 'final', label: 'Final', kind: 'completion', allocationBps: 5000 },
            ],
          },
        },
      },
      {
        expected: 'reservable',
        offer: {
          name: 'Reservable',
          price: '$100',
          url: '',
          reservableResourceTerms: {
            schemaVersion: 1,
            requirements: [{
              poolId: '11111111-1111-4111-8111-111111111111',
              quantity: { source: 'fixed', value: 1 },
            }],
          },
        },
      },
    ]

    for (const variant of variants) {
      const result = await resolveNexxiBookingCapability(
        dbFor(page([variant.offer])),
        { slug: 'demo', offer: 'services-0' },
      )
      expect(result).toMatchObject({ state: 'actionable', rail: variant.expected, reasonCode: 'supported' })
    }
  })

  it('blocks malformed, provider, hidden certification, and checkout-unready offers', async () => {
    await expect(resolveNexxiBookingCapability(dbFor(page([])), {}))
      .resolves.toMatchObject({ state: 'unavailable', reasonCode: 'invalid_contract' })

    await expect(resolveNexxiBookingCapability(
      dbFor(page([{ name: 'Provider', price: '$100', url: 'https://provider.test/book', prefer_original_for_this: true }])),
      { slug: 'demo', offer: 'services-0' },
    )).resolves.toMatchObject({ state: 'view_only', rail: 'provider' })

    await expect(resolveNexxiBookingCapability(
      dbFor(page([{ name: 'Fixture', price: '$1', url: '' }], 'nexez-party-rentals-certification')),
      { slug: 'nexez-party-rentals-certification', offer: 'services-0' },
    )).resolves.toMatchObject({ state: 'unavailable' })

    readinessRef.checkoutReadySlugs = new Set()
    await expect(resolveNexxiBookingCapability(
      dbFor(page([{ name: 'Consultation', price: '$100', url: '' }])),
      { slug: 'demo', offer: 'services-0' },
    )).resolves.toMatchObject({ state: 'unavailable', rail: 'one_time' })
  })

  it('maps search results to client capabilities without trusting an endpoint URL', () => {
    expect(commerceCapabilityForSearchResult({
      source: { id: 'nexez', label: 'Nexez' },
      offer: {
        key: 'services-0',
        type: 'service',
        name: 'Project',
        description: null,
        price: '$100',
        checkout_url: 'https://nexez.test/checkout/demo',
        provider_url: null,
        action: {
          type: 'nexez_checkout',
          rail: 'staged',
          method: 'POST',
          endpoint: 'https://attacker.test/arbitrary',
          content_type: 'application/json',
          body: { slug: 'demo', offer: 'services-0' },
          dry_run_body: { slug: 'demo', offer: 'services-0', dryRun: true },
          input_schema: null,
          required_input_fields: [],
          idempotency_key_required: true,
        },
      },
      page: {} as any,
      score: 1,
      matched_query_terms: [],
      match_reasons: [],
    })).toMatchObject({ state: 'actionable', rail: 'staged' })
  })
})
