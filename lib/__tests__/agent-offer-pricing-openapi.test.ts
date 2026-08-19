import { describe, expect, it } from 'vitest'
import { withOfferConfigurationOpenApi } from '../agent-offer-configuration'

describe('configured pricing OpenAPI contract', () => {
  it('advertises exact quote fields returned by checkout dry-run and payment JSON', () => {
    const spec: any = {
      paths: {
        '/api/checkout': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { slug: { type: 'string' }, offer: { type: 'string' } } },
                },
              },
            },
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
                  },
                },
              },
            },
          },
        },
      },
    }

    const enriched = withOfferConfigurationOpenApi(spec) as any
    const response = enriched.paths['/api/checkout'].post.responses['200'].content['application/json'].schema

    expect(response.properties.amountCents.type).toEqual(['integer', 'null'])
    expect(response.properties.offerConfiguration.type).toBe('object')
    expect(response.properties.offerConfigurationFingerprint.pattern).toBe('^[a-f0-9]{64}$')
    expect(response.properties.offerPricing.properties).toMatchObject({
      schemaVersion: { type: 'integer', enum: [1] },
      currency: { type: 'string' },
      baseAmount: { type: 'integer' },
      adjustmentAmount: { type: 'integer' },
      finalAmount: { type: 'integer', minimum: 1 },
    })
    expect(response.properties.offerPricing.properties.adjustments.items.properties.model.enum)
      .toEqual(['option-delta', 'boolean-delta', 'quantity-delta'])
    expect(response.properties.offerPricingFingerprint.pattern).toBe('^[a-f0-9]{64}$')
  })
})
