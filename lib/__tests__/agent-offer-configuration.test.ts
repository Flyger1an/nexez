import { describe, expect, it } from 'vitest'
import { getCheckoutOffers, type AgentPage } from '../agent-page'
import { buildAgentPagePayload } from '../agent-manifest'
import {
  buildAgentOfferConfiguration,
  buildOfferConfigurationInputSchema,
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
    // Deliberately malformed/sensitive runtime row: public projection must drop it.
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
    // Owner-private negotiation policy must never leak through public attributes.
    { key: 'min_price', label: 'Minimum', valueType: 'text', value: '$100' },
  ],
  rules: { minPrice: '$100', autoAccept: true },
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

  it('publishes public-safe attributes and truthfully marks pricing + settlement boundaries', () => {
    const configuration = buildAgentOfferConfiguration(configuredOffer) as any

    expect(configuration.customer_inputs.map((field: any) => field.key)).toEqual([
      'vehicle_class',
      'appointment_date',
    ])
    expect(configuration.attributes).toEqual([
      { key: 'water_required', label: 'Customer water required', valueType: 'boolean', value: true },
    ])
    expect(configuration.checkout.status).toBe('blocked_pending_pricing')
    expect(configuration.checkout.required_price_affecting_input_blockers).toEqual(['vehicle_class'])
    expect(configuration.checkout.requires_nexez_settlement_when_values_supplied).toBe(true)
    expect(configuration.checkout.external_provider_configuration_supported).toBe(false)
    expect(configuration.checkout.runtime_readiness_check).toContain('dryRun=true')

    const serialized = JSON.stringify(configuration)
    expect(serialized).not.toContain('api_key')
    expect(serialized).not.toContain('min_price')
    expect(serialized).not.toContain('autoAccept')
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

  it('adds generic global OpenAPI support and exact per-offer schemas on scoped specs', () => {
    const baseSpec = {
      paths: {
        '/api/checkout': {
          post: {
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
          },
        },
      },
    }

    const global = withOfferConfigurationOpenApi(structuredClone(baseSpec)) as any
    const globalSchema = global.paths['/api/checkout'].post.requestBody.content['application/json'].schema
    expect(globalSchema.properties.offerConfiguration.type).toBe('object')
    expect(globalSchema.properties.offerConfiguration.description).toContain('Nexez-settled Stripe')
    expect(globalSchema['x-nexez-offer-configuration-schemas']).toBeUndefined()

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
