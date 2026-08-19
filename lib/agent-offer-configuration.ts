import { getCheckoutOfferKey, type CheckoutOffer, type OfferItem } from './agent-page'
import { getOfferAttributes, getOfferCustomerInputs } from './configured-offer'
import type { OfferInputField } from './offer-configuration'

type JsonSchema = Record<string, unknown>

function describeInput(field: OfferInputField, extra?: string): string {
  return [field.description, `Ask buyer: ${field.askBuyer}`, extra]
    .filter(Boolean)
    .join(' ')
}

function optionSchema(field: OfferInputField): JsonSchema[] {
  return (field.options ?? []).map((option) => ({ const: option.value, title: option.label }))
}

/**
 * Exact public JSON-Schema-style contract for the buyer values accepted by
 * validateOfferTransactionConfiguration(). This intentionally mirrors the
 * checkout rail's primitive types and limits rather than inventing a second
 * interpretation for agent clients.
 */
export function buildOfferConfigurationInputSchema(offer: OfferItem): JsonSchema {
  const customerInputs = getOfferCustomerInputs(offer)
  const required = customerInputs.filter((field) => field.required).map((field) => field.key)
  const properties: Record<string, JsonSchema> = {}

  for (const field of customerInputs) {
    const common = {
      title: field.label,
      'x-nexez-ask-buyer': field.askBuyer,
      ...(field.affects?.length ? { 'x-nexez-affects': [...field.affects] } : {}),
    }

    switch (field.valueType) {
      case 'text':
        properties[field.key] = {
          ...common,
          type: 'string',
          maxLength: 2000,
          description: describeInput(field),
        }
        break
      case 'location':
        properties[field.key] = {
          ...common,
          type: 'string',
          maxLength: 500,
          description: describeInput(field, 'Provide a plain location string.'),
        }
        break
      case 'asset':
        properties[field.key] = {
          ...common,
          type: 'string',
          maxLength: 2000,
          description: describeInput(field, 'Provide an asset reference or URL; uploaded bytes/objects are not accepted in v1.'),
        }
        break
      case 'number':
        properties[field.key] = {
          ...common,
          type: 'number',
          description: describeInput(field),
        }
        break
      case 'quantity':
        properties[field.key] = {
          ...common,
          type: 'integer',
          minimum: 1,
          maximum: 1_000_000,
          description: describeInput(field),
        }
        break
      case 'boolean':
        properties[field.key] = {
          ...common,
          type: 'boolean',
          description: describeInput(field),
        }
        break
      case 'single-select':
        properties[field.key] = {
          ...common,
          type: 'string',
          oneOf: optionSchema(field),
          description: describeInput(field, 'Submit the declared option value, not its display label.'),
        }
        break
      case 'multi-select':
        properties[field.key] = {
          ...common,
          type: 'array',
          maxItems: 25,
          items: { oneOf: optionSchema(field) },
          description: describeInput(field, 'Submit declared option values. Order is canonicalized by the checkout rail.'),
        }
        break
      case 'date':
        properties[field.key] = {
          ...common,
          type: 'string',
          format: 'date',
          description: describeInput(field, 'Use YYYY-MM-DD.'),
        }
        break
      case 'date-time':
        properties[field.key] = {
          ...common,
          type: 'string',
          format: 'date-time',
          description: describeInput(field, 'Use an ISO date-time string.'),
        }
        break
    }
  }

  return {
    type: 'object',
    additionalProperties: false,
    properties,
    ...(required.length ? { required } : {}),
  }
}

/**
 * Sanitized machine contract published on agent-facing offer surfaces.
 * Merchant schema/facts are public; buyer answers remain transaction data and
 * are never materialized here.
 *
 * Runtime settlement readiness is intentionally NOT inferred here. #71 accepts
 * non-empty buyer configuration only on a Nexez-settled Stripe rail; an external
 * provider redirect cannot carry arbitrary configuration. Agents should dry-run
 * /api/checkout to resolve the live settlement state before asking for approval.
 */
export function buildAgentOfferConfiguration(offer: OfferItem) {
  const customerInputs = getOfferCustomerInputs(offer)
  const attributes = getOfferAttributes(offer)
  if (!customerInputs.length && !attributes.length) return null

  const priceAffectingInputs = customerInputs
    .filter((field) => field.affects?.includes('price'))
    .map((field) => field.key)
  const requiredPriceAffectingInputs = customerInputs
    .filter((field) => field.required && field.affects?.includes('price'))
    .map((field) => field.key)
  const hasBuyerInputs = customerInputs.length > 0

  const checkoutStatus = !hasBuyerInputs
    ? 'not_required'
    : requiredPriceAffectingInputs.length
      ? 'blocked_pending_pricing'
      : 'requires_nexez_settlement'

  return {
    request_field: 'offerConfiguration',
    customer_inputs: customerInputs,
    attributes,
    input_schema: hasBuyerInputs ? buildOfferConfigurationInputSchema(offer) : null,
    checkout: {
      status: checkoutStatus,
      requires_nexez_settlement_when_values_supplied: hasBuyerInputs,
      external_provider_configuration_supported: false,
      runtime_readiness_check: hasBuyerInputs ? 'POST /api/checkout with dryRun=true before approval.' : null,
      price_affecting_inputs_blocked_when_supplied: priceAffectingInputs,
      required_price_affecting_input_blockers: requiredPriceAffectingInputs,
      note: !hasBuyerInputs
        ? 'This offer publishes attributes but does not require buyer configuration.'
        : requiredPriceAffectingInputs.length
          ? 'Checkout is blocked until Nexez publishes deterministic pricing for the required price-affecting inputs. Configured values also require a Nexez-settled Stripe checkout; external provider redirects cannot carry them.'
          : priceAffectingInputs.length
            ? 'Configured values require a Nexez-settled Stripe checkout. Price-affecting optional inputs must be omitted until deterministic configuration pricing exists; external provider redirects cannot carry configured values.'
            : 'Configured values require a Nexez-settled Stripe checkout. External provider redirects cannot carry configured values; dry-run checkout to confirm live settlement readiness.',
    },
  }
}

/** Global OpenAPI fallback. Exact allowed keys/types are offer-specific and are
 * published on each offer manifest plus the per-page x-nexez schema map. */
export function genericOfferConfigurationSchema(): JsonSchema {
  return {
    type: 'object',
    description: 'Buyer values keyed by the target offer\'s merchant-authored customer input fields. Unknown fields are rejected. Non-empty configured values require a Nexez-settled Stripe checkout and are not carried through external provider redirects. Read the offer\'s agent.json configuration.input_schema (or the per-page x-nexez-offer-configuration-schemas map) for exact keys and types, then dry-run /api/checkout to confirm live settlement readiness.',
    additionalProperties: {
      oneOf: [
        { type: 'string' },
        { type: 'number' },
        { type: 'boolean' },
        { type: 'array', items: { type: 'string' }, maxItems: 25 },
      ],
    },
  }
}

/**
 * Enrich an already-built Nexez OpenAPI document without duplicating the large
 * shared capability builder. Global specs get the generic request field; scoped
 * page specs additionally expose an exact schema map keyed by real offer key.
 */
export function withOfferConfigurationOpenApi<T extends Record<string, any>>(
  spec: T,
  offers?: CheckoutOffer[],
): T {
  const checkoutSchema = spec?.paths?.['/api/checkout']?.post?.requestBody?.content?.['application/json']?.schema
  if (!checkoutSchema?.properties) return spec

  checkoutSchema.properties.offerConfiguration = genericOfferConfigurationSchema()

  if (offers?.length) {
    const perOfferSchemas: Record<string, JsonSchema> = {}
    for (const offer of offers) {
      const configuration = buildAgentOfferConfiguration(offer)
      if (!configuration?.input_schema) continue
      perOfferSchemas[getCheckoutOfferKey(offer.kind, offer.index)] = configuration.input_schema
    }
    if (Object.keys(perOfferSchemas).length) {
      checkoutSchema['x-nexez-offer-configuration-schemas'] = perOfferSchemas
    }
  }

  return spec
}
