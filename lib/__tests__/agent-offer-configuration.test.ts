import { describe, expect, it } from 'vitest'
import { getCheckoutOffers, type AgentPage } from '../agent-page'
import { buildAgentPagePayload } from '../agent-manifest'
import {
  buildAgentOfferConfiguration,
  buildOfferConfigurationInputSchema,
  getOfferCheckoutPath,
  withOfferConfigurationOpenApi,
} from '../agent-offer-configuration'

const configuredOffer = {
  name: 'Mobile Detail',
  description: 'Detail a vehicle at the buyer location.',
  price: '$150',
  url: '',
  customerInputs: [
    {
      key: 'vehicle_class',
      label: 'Vehicle class',
      valueType: 'single-select',
      required: true,
      options: [
        { value: 'sedan', label: 'Sedan' },
        { value: 'suv', label: 'SUV' },
      ],
      askBuyer: 'What kind of vehicle is this?',
      affects: ['price'],
    },
    {
      key: 'appointment_date',
      label: 'Appointment date',
      valueType: 'date',
      required: true,
      askBuyer: 'Which date works for you?',
      affects: ['availability'],
    },
    {
      key: 'api_key',
      label: 'API key',
      valueType: 'text',
      required: true,
      askBuyer: 'Give me a secret.',
    },
  ],
  attributes: [
    { key: 'water_required', label: 'Customer water required', valueType: 'boolean', value: true },
    { key: 'min_price', label: 'Minimum', valueType: 'text', value: '$100' },
  ],
  rules: { minPrice: '$100', autoAccept: true },
} as any

const pricedConfiguredOffer = {
  ...configuredOffer,
  customerInputs: configuredOffer.customerInputs.map((field: any) =>
    field.key === 'vehicle_class'
      ? {
          ...field,
          pricing: {
            model: 'option-delta',
            adjustments: [{ value: 'suv', delta: '25' }],
          },
        }
      : field,
  ),
}

const recurringOffer = {
  name: 'Recurring Cleaning',
  description: 'Merchant-authored weekly or biweekly cleaning.',
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
} as any

const page = {
  id: 'p1',
  slug: 'detailer',
  name: 'Detailer',
  description: 'Mobile detailing',
  services: [configuredOffer],
  products: [],
  faqs: [],
  is_published: true,
  website_url: null,
  cta_url: null,
  cta_label: null,
  audience: null,
  location: null,
  contact_email: null,
} as unknown as AgentPage

describe('configured offer agent contract', () => {
  it('builds an exact checkout-compatible input schema from sanitized merchant fields', () => {
    const schema = buildOfferConfigurationInputSchema(configuredOffer) as any

    expect(schema.additionalProperties).toBe(false)
    expect(schema.required).toEqual(['vehicle_class', 'appointment_date'])
    expect(schema.properties.vehicle_class.oneOf).toEqual([
      { const: 'sedan', title: 'Sedan' },
      { const: 'suv', title: 'SUV' },
    ])
    expect(schema.properties.appointment_date).toMatchObject({ type: 'string', format: 'date' })
    expect(schema.properties.api_key).toBeUndefined()
  })

  it('publishes public-safe attributes and truthfully marks unresolved pricing + settlement boundaries', () => {
    const configuration = buildAgentOfferConfiguration(configuredOffer) as any

    expect(configuration.customer_inputs.map((field: any) => field.key)).toEqual([
      'vehicle_class',
      'appointment_date',
    ])
    expect(configuration.attributes).toEqual([
      { key: 'water_required', label: 'Customer water required', valueType: 'boolean', value: true },
    ])
    expect(configuration.checkout.status).toBe('blocked_pending_pricing')
    expect(configuration.checkout.path).toBe('/api/checkout')
    expect(configuration.checkout.required_price_affecting_input_blockers).toEqual(['vehicle_class'])
    expect(configuration.checkout.requires_nexez_settlement_when_values_supplied).toBe(true)
    expect(configuration.checkout.external_provider_configuration_supported).toBe(false)
    expect(configuration.checkout.runtime_readiness_check).toContain('dryRun=true')

    const serialized = JSON.stringify(configuration)
    expect(serialized).not.toContain('api_key')
    expect(serialized).not.toContain('min_price')
    expect(serialized).not.toContain('autoAccept')
  })

  it('publishes exact merchant-authored pricing and stops marking a fully priced required field as blocked', () => {
    const configuration = buildAgentOfferConfiguration(pricedConfiguredOffer) as any
    const vehicleClass = configuration.customer_inputs.find((field: any) => field.key === 'vehicle_class')

    expect(vehicleClass.pricing).toEqual({
      model: 'option-delta',
      adjustments: [{ value: 'suv', delta: '25' }],
    })
    expect(configuration.checkout.status).toBe('requires_nexez_settlement')
    expect(configuration.checkout.deterministically_priced_inputs).toEqual(['vehicle_class'])
    expect(configuration.checkout.unpriced_price_affecting_inputs_blocked_when_supplied).toEqual([])
    expect(configuration.checkout.required_price_affecting_input_blockers).toEqual([])
    expect(configuration.checkout.note).toContain('Dry-run checkout returns the exact final amount')
  })

  it('publishes recurring merchant terms with the dedicated recurring checkout path', () => {
    const configuration = buildAgentOfferConfiguration(recurringOffer) as any

    expect(configuration.recurring_service.terms).toEqual(recurringOffer.recurringTerms)
    expect(configuration.recurring_service.checkout_path).toBe('/api/service-agreements/checkout')
    expect(configuration.recurring_service.pause_supported).toBe(false)
    expect(configuration.checkout.path).toBe('/api/service-agreements/checkout')
    expect(configuration.checkout.runtime_readiness_check)
      .toBe('POST /api/service-agreements/checkout with dryRun=true before approval.')
  })

  it('uses one routing decision for every advanced checkout rail', () => {
    const staged = {
      name: 'Staged project',
      price: '$200',
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
    } as any
    const reservable = {
      name: 'Reserved capacity',
      price: '$100',
      source: 'nexez',
      reservableResourceTerms: {
        schemaVersion: 1,
        requirements: [{
          poolId: '11111111-1111-4111-8111-111111111111',
          quantity: { source: 'fixed', value: 1 },
        }],
      },
    } as any

    expect(getOfferCheckoutPath({ name: 'Legacy', price: '$10' } as any)).toBe('/api/checkout')
    expect(getOfferCheckoutPath(recurringOffer)).toBe('/api/service-agreements/checkout')
    expect(getOfferCheckoutPath(staged)).toBe('/api/staged-settlements/checkout')
    expect(getOfferCheckoutPath(reservable)).toBe('/api/reservable-resources/checkout')
  })

  it('threads the same sanitized contract into agent.json without materializing buyer answers', () => {
    const payload = buildAgentPagePayload(page, 'https://nexez.app') as any
    const offer = payload.offers[0]

    expect(offer.configuration.request_field).toBe('offerConfiguration')
    expect(offer.action.configuration_field).toBe('offerConfiguration')
    expect(offer.action.configuration_schema).toEqual(offer.configuration.input_schema)
    expect(offer.action.body).toEqual({ slug: 'detailer', offer: 'services-0' })
    expect(offer.action.body.offerConfiguration).toBeUndefined()
  })

  it('adds generic global OpenAPI support, exact per-offer schemas, and a recurring checkout path', () => {
    const baseSpec = {
      paths: {
        '/api/checkout': {
          post: {
            summary: 'Checkout',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      slug: { type: 'string' },
                      offer: { type: 'string' },
                    },
                  },
                },
              },
            },
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: { type: 'object', properties: {} },
                  },
                },
              },
            },
          },
        },
      },
    }

    const global = withOfferConfigurationOpenApi(structuredClone(baseSpec)) as any
    const globalSchema = global.paths['/api/checkout'].post.requestBody.content['application/json'].schema
    expect(globalSchema.properties.offerConfiguration.type).toBe('object')
    expect(globalSchema.properties.offerConfiguration.description).toContain('configuration.checkout.path')
    expect(globalSchema['x-nexez-offer-configuration-schemas']).toBeUndefined()
    expect(global.paths['/api/service-agreements/checkout'].post.summary).toContain('recurring service agreement')
    expect(global.paths['/api/service-agreements/checkout'].post.responses['200'].content['application/json'].schema.properties.recurringAgreement)
      .toBeDefined()
    expect(global.paths['/api/checkout'].post.responses['200'].content['application/json'].schema.properties.recurringAgreement)
      .toBeUndefined()

    const scoped = withOfferConfigurationOpenApi(structuredClone(baseSpec), getCheckoutOffers(page)) as any
    const scopedSchema = scoped.paths['/api/checkout'].post.requestBody.content['application/json'].schema
    expect(scopedSchema['x-nexez-offer-configuration-schemas']['services-0'].required)
      .toEqual(['vehicle_class', 'appointment_date'])
  })

  it('keeps legacy unconfigured offers free of configuration fields', () => {
    const legacyPage = {
      ...page,
      services: [{ name: 'Simple Detail', description: '', price: '$75', url: '' }],
    } as AgentPage
    const payload = buildAgentPagePayload(legacyPage, 'https://nexez.app') as any

    expect(payload.offers[0].configuration).toBeUndefined()
    expect(payload.offers[0].action.configuration_field).toBeUndefined()
    expect(payload.offers[0].action.configuration_schema).toBeUndefined()
  })
})
