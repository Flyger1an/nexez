import { describe, expect, it } from 'vitest'
import type { AgentPage } from '../agent-page'
import { buildAgentPagePayload } from '../agent-manifest'

const page = {
  id: 'p-recurring',
  name: 'Weekly Clean Co',
  slug: 'weekly-clean',
  description: 'Recurring home cleaning.',
  website_url: null,
  cta_url: null,
  cta_label: null,
  audience: null,
  location: null,
  contact_email: null,
  products: [],
  services: [{
    name: 'Recurring clean',
    description: 'Weekly or biweekly cleaning.',
    price: '$120',
    url: '',
    customerInputs: [{
      key: 'cadence',
      label: 'Cadence',
      valueType: 'single-select',
      required: true,
      options: [
        { value: 'weekly', label: 'Weekly' },
        { value: 'biweekly', label: 'Every other week' },
      ],
      askBuyer: 'How often should the service recur?',
      affects: ['availability'],
    }],
    recurringTerms: {
      schemaVersion: 1,
      paymentModel: 'fixed-per-period',
      schedule: {
        mode: 'buyer-option',
        inputKey: 'cadence',
        options: [
          { value: 'weekly', cadence: { interval: 'week', intervalCount: 1 } },
          { value: 'biweekly', cadence: { interval: 'week', intervalCount: 2 } },
        ],
      },
      startPolicy: 'first-successful-payment',
      endPolicy: 'until-cancelled',
      cancellationPolicy: 'period-end',
      pausePolicy: 'unsupported',
    },
  }],
  faqs: [],
  is_published: true,
} as unknown as AgentPage

describe('recurring service agent manifest', () => {
  it('routes the action and dry-run contract to recurring checkout instead of one-time checkout', () => {
    const payload = buildAgentPagePayload(page, 'https://nexez.test') as any
    const offer = payload.offers[0]

    expect(offer.configuration.recurring_service.checkout_path).toBe('/api/service-agreements/checkout')
    expect(offer.configuration.checkout.path).toBe('/api/service-agreements/checkout')
    expect(offer.action.endpoint).toBe('https://nexez.test/api/service-agreements/checkout')
    expect(offer.action.body).toEqual({ slug: 'weekly-clean', offer: 'services-0' })
    expect(offer.action.dry_run_body).toEqual({ slug: 'weekly-clean', offer: 'services-0', dryRun: true })
  })
})