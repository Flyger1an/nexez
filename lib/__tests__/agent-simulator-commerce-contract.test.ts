import { describe, expect, it } from 'vitest'
import type { AgentPage } from '../agent-page'
import { buildParsedSchema, buildPublicDemoSchema, runMultiAgentSimulation } from '../agent-simulator'

const page = {
  id: 'sim-commerce',
  owner_id: 'owner-sim-commerce',
  slug: 'sim-commerce',
  name: 'Simulator Commerce',
  description: 'Structured services for simulator parity.',
  website_url: null,
  cta_url: null,
  cta_label: null,
  audience: 'Local buyers',
  location: 'Dallas',
  contact_email: 'hello@example.com',
  is_published: true,
  products: [],
  services: [
    {
      name: 'Pet Care Visit',
      price: '$80',
      description: 'One-time pet care.',
      url: '',
      customerInputs: [{
        key: 'pet_count',
        label: 'Pet count',
        valueType: 'quantity',
        required: true,
        askBuyer: 'How many pets need care?',
        affects: ['eligibility'],
      }],
      fulfillmentRules: [{
        id: 'large-pack-review',
        inputKey: 'pet_count',
        operator: 'gte',
        value: 4,
        decision: 'requires-review',
        reasonCode: 'capacity.large_pack',
        message: 'Four or more pets require merchant review.',
      }],
    },
    {
      name: 'Weekly Cleaning',
      price: '$120',
      description: 'Recurring cleaning.',
      url: '',
      recurringTerms: {
        schemaVersion: 1,
        paymentModel: 'fixed-per-period',
        schedule: { mode: 'fixed', cadence: { interval: 'week', intervalCount: 1 } },
        startPolicy: 'first-successful-payment',
        endPolicy: 'until-cancelled',
        cancellationPolicy: 'period-end',
        pausePolicy: 'unsupported',
      },
    },
  ],
  faqs: [],
  created_at: '2026-08-19T00:00:00.000Z',
} as unknown as AgentPage

function assertCommerceParity(schema: any) {
  const conditional = schema.page.offers.find((offer: any) => offer.key === 'services-0')
  expect(conditional.configuration.conditional_fulfillment.rules).toEqual([
    expect.objectContaining({ id: 'large-pack-review', operator: 'gte', value: 4 }),
  ])
  expect(conditional.configuration.checkout.path).toBe('/api/checkout')
  expect(conditional.action.endpoint).toBe('https://nexez.test/api/checkout')
  expect(conditional.action.configuration_field).toBe('offerConfiguration')
  expect(conditional.action.dry_run_body).toEqual({ slug: 'sim-commerce', offer: 'services-0', dryRun: true })

  const recurring = schema.page.offers.find((offer: any) => offer.key === 'services-1')
  expect(recurring.configuration.recurring_service.terms.schedule).toEqual({
    mode: 'fixed', cadence: { interval: 'week', intervalCount: 1 },
  })
  expect(recurring.configuration.checkout.path).toBe('/api/service-agreements/checkout')
  expect(recurring.action.endpoint).toBe('https://nexez.test/api/service-agreements/checkout')
  expect(recurring.action.dry_run_body).toEqual({ slug: 'sim-commerce', offer: 'services-1', dryRun: true })
}

describe('agent simulator commerce-contract parity', () => {
  it('enriches the deterministic simulator schema with the same offer contract as agent.json', () => {
    assertCommerceParity(buildParsedSchema(page, 'book pet care', 'Generic Agent', 'https://nexez.test'))
  })

  it('keeps the public demo schema on the same commerce contract', () => {
    assertCommerceParity(buildPublicDemoSchema(page, 'book pet care', 'https://nexez.test'))
  })

  it('threads the enriched contract through every multi-agent result', () => {
    const simulation = runMultiAgentSimulation(page, 'book pet care', 'https://nexez.test')
    expect(simulation.results).toHaveLength(5)
    for (const result of simulation.results) assertCommerceParity(result.schema)
  })
})
