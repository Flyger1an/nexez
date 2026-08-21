import { describe, expect, it } from 'vitest'
import {
  buildAgentOfferConfiguration,
  withOfferConfigurationOpenApi,
} from '../agent-offer-configuration'
import type { CheckoutOffer } from '../agent-page'

const offer = {
  kind: 'services',
  index: 0,
  name: 'Private Dinner',
  price: '$800',
  description: 'Capacity-bound dinner.',
  url: '',
  customerInputs: [{
    key: 'guest_count', label: 'Guest count', valueType: 'quantity', required: true, askBuyer: 'How many guests?',
  }],
  reservableResourceTerms: {
    schemaVersion: 1,
    requirements: [{
      poolId: '11111111-1111-4111-8111-111111111111',
      windowId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      quantity: { source: 'input', inputKey: 'guest_count' },
    }],
  },
} as CheckoutOffer

describe('agent reservable-resource contract', () => {
  it('publishes requirements and points agents to the authoritative hold rail', () => {
    expect(buildAgentOfferConfiguration(offer)).toMatchObject({
      reservable_resources: {
        runtime_status: 'active',
        availability_status: 'requires_authoritative_dry_run',
        terms: { requirements: [{ poolId: '11111111-1111-4111-8111-111111111111' }] },
      },
      checkout: {
        status: 'requires_nexez_settlement',
        path: '/api/reservable-resources/checkout',
        idempotency_key_required: true,
      },
    })
  })

  it('publishes the resource checkout and exact held-state response in OpenAPI', () => {
    const spec = withOfferConfigurationOpenApi({
      paths: {
        '/api/checkout': {
          post: {
            requestBody: { content: { 'application/json': { schema: { type: 'object', properties: {} } } } },
            responses: { '200': { content: { 'application/json': { schema: { type: 'object', properties: {} } } } } },
          },
        },
      },
    }, [offer]) as any
    const post = spec.paths['/api/reservable-resources/checkout'].post
    expect(post.parameters).toContainEqual(expect.objectContaining({ name: 'Idempotency-Key', required: true }))
    expect(post.responses['200'].content['application/json'].schema.properties.resources).toMatchObject({
      properties: {
        status: { enum: ['held'] },
        allocations: { minItems: 1, maxItems: 3 },
      },
    })
  })
})
