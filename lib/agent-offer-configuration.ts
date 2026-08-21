import { getCheckoutOfferKey, type CheckoutOffer, type OfferItem } from './agent-page'
import {
  getOfferAttributes,
  getOfferCustomerInputs,
  getOfferFulfillmentRules,
  getOfferRecurringTerms,
  getOfferReservableResourceTerms,
  getOfferStagedSettlementTerms,
} from './configured-offer'
import type { OfferInputField } from './offer-configuration'

type JsonSchema = Record<string, unknown>

function describeInput(field: OfferInputField, extra?: string): string {
  return [field.description, `Ask buyer: ${field.askBuyer}`, extra].filter(Boolean).join(' ')
}

function optionSchema(field: OfferInputField): JsonSchema[] {
  return (field.options ?? []).map((option) => ({ const: option.value, title: option.label }))
}

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
        properties[field.key] = { ...common, type: 'string', maxLength: 2000, description: describeInput(field) }
        break
      case 'location':
        properties[field.key] = { ...common, type: 'string', maxLength: 500, description: describeInput(field, 'Provide a plain location string.') }
        break
      case 'asset':
        properties[field.key] = { ...common, type: 'string', maxLength: 2000, description: describeInput(field, 'Provide an asset reference or URL; uploaded bytes/objects are not accepted in v1.') }
        break
      case 'number':
        properties[field.key] = { ...common, type: 'number', description: describeInput(field) }
        break
      case 'quantity':
        properties[field.key] = { ...common, type: 'integer', minimum: 1, maximum: 1_000_000, description: describeInput(field) }
        break
      case 'boolean':
        properties[field.key] = { ...common, type: 'boolean', description: describeInput(field) }
        break
      case 'single-select':
        properties[field.key] = { ...common, type: 'string', oneOf: optionSchema(field), description: describeInput(field, 'Submit the declared option value, not its display label.') }
        break
      case 'multi-select':
        properties[field.key] = { ...common, type: 'array', maxItems: 25, items: { oneOf: optionSchema(field) }, description: describeInput(field, 'Submit declared option values. Order is canonicalized by the checkout rail.') }
        break
      case 'date':
        properties[field.key] = { ...common, type: 'string', format: 'date', description: describeInput(field, 'Use YYYY-MM-DD.') }
        break
      case 'date-time':
        properties[field.key] = { ...common, type: 'string', format: 'date-time', description: describeInput(field, 'Use an ISO date-time string.') }
        break
    }
  }
  return { type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) }
}

/**
 * Sanitized machine contract published on agent-facing offer surfaces. Recurring
 * terms, conditional fulfillment rules, and finite staged schedules are
 * merchant-authored public truth. Resolved cadence, fulfillment evaluation, and
 * stage amounts remain transaction data returned by their authoritative rails.
 */
export function buildAgentOfferConfiguration(offer: OfferItem) {
  const customerInputs = getOfferCustomerInputs(offer)
  const attributes = getOfferAttributes(offer)
  const recurringTerms = getOfferRecurringTerms(offer)
  const fulfillmentRules = getOfferFulfillmentRules(offer)
  const stagedSettlementTerms = getOfferStagedSettlementTerms(offer)
  const reservableResourceTerms = getOfferReservableResourceTerms(offer)
  if (!customerInputs.length && !attributes.length && !recurringTerms && !fulfillmentRules.length && !stagedSettlementTerms && !reservableResourceTerms) return null

  const priceFields = customerInputs.filter((field) => field.affects?.includes('price'))
  const deterministicallyPricedInputs = priceFields.filter((field) => field.pricing).map((field) => field.key)
  const unpricedPriceInputs = priceFields.filter((field) => !field.pricing).map((field) => field.key)
  const requiredUnpricedPriceInputs = priceFields.filter((field) => field.required && !field.pricing).map((field) => field.key)
  const hasBuyerInputs = customerInputs.length > 0
  const hasConditionalFulfillment = fulfillmentRules.length > 0
  const requiresSettlement = hasBuyerInputs || Boolean(recurringTerms) || hasConditionalFulfillment || Boolean(stagedSettlementTerms) || Boolean(reservableResourceTerms)
  const checkoutPath = recurringTerms
    ? '/api/service-agreements/checkout'
    : stagedSettlementTerms
      ? '/api/staged-settlements/checkout'
      : reservableResourceTerms
        ? '/api/reservable-resources/checkout'
        : '/api/checkout'

  const checkoutStatus = requiredUnpricedPriceInputs.length
      ? 'blocked_pending_pricing'
      : requiresSettlement
        ? 'requires_nexez_settlement'
        : 'not_required'

  return {
    request_field: 'offerConfiguration',
    customer_inputs: customerInputs,
    attributes,
    conditional_fulfillment: hasConditionalFulfillment
      ? {
          schema_version: 1,
          rules: fulfillmentRules,
          possible_decisions: ['eligible', 'requires-review', 'ineligible'],
          evaluation_source: 'deterministic merchant-authored rules over normalized required buyer inputs',
          enforcement: `POST ${checkoutPath} with dryRun=true before buyer approval; payable checkout is issued only when decision=eligible.`,
          note: 'Do not infer missing qualification facts. Ask for the declared required buyer inputs and use the exact option values published in input_schema.',
        }
      : null,
    recurring_service: recurringTerms
      ? {
          terms: recurringTerms,
          checkout_path: checkoutPath,
          resolved_schedule_source: recurringTerms.schedule.mode,
          starts: 'after the first successful subscription payment',
          ends: 'at the end of a paid period after cancellation',
          pause_supported: false,
          note: 'Recurring service v1 uses fixed per-period Stripe subscription billing. Dry-run the dedicated recurring checkout path to resolve buyer-option cadence and bind the exact agreement before approval.',
        }
      : null,
    staged_settlement: stagedSettlementTerms
      ? {
          schema_version: 1,
          terms: stagedSettlementTerms,
          runtime_status: 'active',
          checkout_supported: true,
          resolution_source: 'one authoritative deterministic or negotiated total and currency',
          payment_policy: 'Every stage requires a fresh buyer approval. No future stage is charged automatically.',
          note: 'Dry-run the staged settlement checkout to resolve the exact total and first obligation. Every later obligation requires merchant readiness plus a fresh buyer approval; no future stage is charged automatically.',
        }
      : null,
    reservable_resources: reservableResourceTerms
      ? {
          schema_version: 1,
          terms: reservableResourceTerms,
          runtime_status: 'active',
          checkout_supported: true,
          availability_status: 'requires_authoritative_dry_run',
          authority: 'Nexez-owned merchant-authored pools only; external calendars and inventory remain external authority.',
          hold_policy: 'Dry-run atomically acquires every required allocation for up to 60 minutes. Held is not committed; only the matching authoritative payment event commits the reservation.',
          note: `POST ${checkoutPath} with dryRun=true and an Idempotency-Key. The production resolver consumes canonical buyer quantity, returns the exact hold/window/version/expiry, and never fabricates availability.`,
        }
      : null,
    input_schema: hasBuyerInputs ? buildOfferConfigurationInputSchema(offer) : null,
    checkout: {
      status: checkoutStatus,
      path: checkoutPath,
      requires_nexez_settlement_when_values_supplied: hasBuyerInputs,
      conditional_fulfillment_requires_nexez_settlement: hasConditionalFulfillment,
      recurring_service_requires_nexez_settlement: Boolean(recurringTerms),
      staged_settlement_requires_nexez_settlement: Boolean(stagedSettlementTerms),
      reservable_resources_require_nexez_settlement: Boolean(reservableResourceTerms),
      idempotency_key_required: Boolean(stagedSettlementTerms || reservableResourceTerms),
      external_provider_configuration_supported: false,
      runtime_readiness_check: requiresSettlement
          ? `POST ${checkoutPath} with dryRun=true before approval.`
          : null,
      deterministically_priced_inputs: deterministicallyPricedInputs,
      unpriced_price_affecting_inputs_blocked_when_supplied: unpricedPriceInputs,
      required_price_affecting_input_blockers: requiredUnpricedPriceInputs,
      note: stagedSettlementTerms
        ? 'Staged checkout charges only the current obligation. The agreement ledger distinguishes total, paid, current due, and remaining amounts; every payment requires fresh payload-bound approval and an Idempotency-Key.'
        : reservableResourceTerms
          ? 'Resource checkout dry-run atomically acquires the exact merchant-owned units before buyer approval. The same Idempotency-Key must be used for dry-run and payment; available, held, and committed are distinct states.'
        : requiredUnpricedPriceInputs.length
          ? 'Checkout is blocked because a required price-affecting buyer input lacks a deterministic merchant-authored pricing rule.'
          : recurringTerms
          ? 'Recurring service requires Nexez-settled Stripe subscription checkout. Dry-run resolves and fingerprints exact per-period amount, cadence, configuration, fulfillment decision, and merchant recurring terms before buyer approval.'
          : hasConditionalFulfillment
            ? 'Nexez evaluates merchant-authored fulfillment gates over normalized buyer values before approval. Review-required and ineligible configurations never receive a payable checkout.'
            : !hasBuyerInputs
              ? 'This offer publishes attributes but does not require buyer configuration.'
              : unpricedPriceInputs.length
                ? 'Configured values require a Nexez-settled Stripe checkout. Deterministically priced inputs are supported; unpriced optional price-affecting inputs must be omitted.'
                : deterministicallyPricedInputs.length
                  ? 'Configured values and deterministic merchant-authored pricing are supported on the Nexez-settled Stripe rail. Dry-run checkout returns the exact final amount before approval.'
                  : 'Configured values require a Nexez-settled Stripe checkout; dry-run checkout confirms live settlement readiness.',
    },
  }
}

export function genericOfferConfigurationSchema(): JsonSchema {
  return {
    type: 'object',
    description: 'Buyer values keyed by the target offer\'s merchant-authored customer input fields. Unknown fields are rejected. Read the offer\'s agent.json configuration.input_schema for exact keys/types and configuration.checkout.path for the correct one-time or recurring checkout rail.',
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

function configuredCheckoutPricingResponseSchema(): JsonSchema {
  return {
    type: 'object',
    description: 'Exact deterministic checkout-time pricing snapshot in Stripe smallest units.',
    properties: {
      schemaVersion: { type: 'integer', enum: [1] },
      currency: { type: 'string' },
      baseAmount: { type: 'integer' },
      adjustments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            fieldKey: { type: 'string' },
            label: { type: 'string' },
            value: {},
            model: { type: 'string', enum: ['option-delta', 'boolean-delta', 'quantity-delta'] },
            rule: { type: 'object' },
            amount: { type: 'integer' },
          },
        },
      },
      adjustmentAmount: { type: 'integer' },
      finalAmount: { type: 'integer', minimum: 1 },
    },
    required: ['schemaVersion', 'currency', 'baseAmount', 'adjustments', 'adjustmentAmount', 'finalAmount'],
  }
}

function conditionalFulfillmentResponseSchema(): JsonSchema {
  return {
    type: 'object',
    description: 'Deterministic checkout-time evaluation of the exact merchant-authored conditional fulfillment policy used for this buyer configuration.',
    properties: {
      schemaVersion: { type: 'integer', enum: [1] },
      policyRules: {
        type: 'array',
        description: 'Exact normalized merchant rule set evaluated at checkout time.',
        items: { type: 'object' },
      },
      decision: { type: 'string', enum: ['eligible', 'requires-review', 'ineligible'] },
      matchedRuleIds: { type: 'array', items: { type: 'string' } },
      reasons: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            ruleId: { type: 'string' },
            inputKey: { type: 'string' },
            decision: { type: 'string', enum: ['requires-review', 'ineligible'] },
            reasonCode: { type: 'string' },
            message: { type: 'string' },
            nextAction: { type: 'string', enum: ['contact-merchant', 'send-proposal'] },
          },
          required: ['ruleId', 'inputKey', 'decision', 'reasonCode', 'message'],
        },
      },
    },
    required: ['schemaVersion', 'policyRules', 'decision', 'matchedRuleIds', 'reasons'],
  }
}

function recurringAgreementResponseSchema(): JsonSchema {
  return {
    type: 'object',
    description: 'Exact buyer-approval-bound recurring service agreement snapshot.',
    properties: {
      schemaVersion: { type: 'integer', enum: [1] },
      terms: { type: 'object' },
      resolvedSchedule: {
        type: 'object',
        properties: {
          interval: { type: 'string', enum: ['day', 'week', 'month', 'year'] },
          intervalCount: { type: 'integer', minimum: 1 },
          source: { type: 'string', enum: ['fixed', 'buyer-option'] },
          inputKey: { type: 'string' },
          inputValue: { type: 'string' },
        },
        required: ['interval', 'intervalCount', 'source'],
      },
      configuration: { type: 'object' },
      fulfillment: conditionalFulfillmentResponseSchema(),
      pricing: { oneOf: [configuredCheckoutPricingResponseSchema(), { type: 'null' }] },
      amountPerPeriod: { type: 'integer', minimum: 1 },
      currency: { type: 'string' },
    },
    required: ['schemaVersion', 'terms', 'resolvedSchedule', 'configuration', 'fulfillment', 'pricing', 'amountPerPeriod', 'currency'],
  }
}

function reservableResourceResponseSchema(): JsonSchema {
  return {
    type: 'object',
    description: 'Authoritative production resource hold acquired during dry-run. This is not a committed reservation until the matching payment event succeeds.',
    properties: {
      status: { type: 'string', enum: ['held'] },
      holdId: { type: 'string', format: 'uuid' },
      expiresAt: { type: 'string', format: 'date-time' },
      allocationFingerprint: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      allocations: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            poolId: { type: 'string', format: 'uuid' },
            poolKey: { type: 'string' },
            poolLabel: { type: 'string' },
            poolVersion: { type: 'integer', minimum: 1 },
            kind: { type: 'string', enum: ['consumable', 'reusable'] },
            unit: { type: 'string' },
            quantity: { type: 'integer', minimum: 1, maximum: 10000 },
            windowId: { type: ['string', 'null'], format: 'uuid' },
            windowVersion: { type: ['integer', 'null'], minimum: 1 },
            startsAt: { type: ['string', 'null'], format: 'date-time' },
            endsAt: { type: ['string', 'null'], format: 'date-time' },
          },
          required: ['poolId', 'poolVersion', 'kind', 'unit', 'quantity'],
        },
      },
    },
    required: ['status', 'holdId', 'expiresAt', 'allocationFingerprint', 'allocations'],
  }
}

export function withOfferConfigurationOpenApi<T extends Record<string, any>>(
  spec: T,
  offers?: CheckoutOffer[],
): T {
  const checkoutPost = spec?.paths?.['/api/checkout']?.post
  const checkoutSchema = checkoutPost?.requestBody?.content?.['application/json']?.schema
  if (!checkoutSchema?.properties) return spec

  checkoutSchema.properties.offerConfiguration = genericOfferConfigurationSchema()

  if (offers?.length) {
    const perOfferSchemas: Record<string, JsonSchema> = {}
    for (const offer of offers) {
      const configuration = buildAgentOfferConfiguration(offer)
      if (!configuration?.input_schema) continue
      perOfferSchemas[getCheckoutOfferKey(offer.kind, offer.index)] = configuration.input_schema
    }
    if (Object.keys(perOfferSchemas).length) checkoutSchema['x-nexez-offer-configuration-schemas'] = perOfferSchemas
  }

  const responseSchema = checkoutPost?.responses?.['200']?.content?.['application/json']?.schema
  if (responseSchema?.properties) {
    Object.assign(responseSchema.properties, {
      amountCents: { type: ['integer', 'null'], description: 'Exact final checkout amount in Stripe smallest units when Nexez can resolve a price.' },
      offerConfiguration: { type: 'object' },
      offerConfigurationFingerprint: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      offerPricing: configuredCheckoutPricingResponseSchema(),
      offerPricingFingerprint: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      offerFulfillment: conditionalFulfillmentResponseSchema(),
      offerFulfillmentFingerprint: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    })
  }

  const recurringPost = JSON.parse(JSON.stringify(checkoutPost)) as Record<string, any>
  recurringPost.summary = 'Create or dry-run a merchant-authored recurring service agreement'
  recurringPost.description = 'Recurring service offers must use this endpoint. Dry-run resolves exact cadence, per-period pricing, configuration, conditional fulfillment decision, and agreement fingerprint before buyer approval.'
  const recurringResponse = recurringPost?.responses?.['200']?.content?.['application/json']?.schema
  if (recurringResponse?.properties) {
    Object.assign(recurringResponse.properties, {
      recurringAgreement: recurringAgreementResponseSchema(),
      recurringAgreementFingerprint: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      serviceAgreementId: { type: 'string', format: 'uuid' },
    })
  }
  spec.paths['/api/service-agreements/checkout'] = { post: recurringPost }

  const resourcePost = JSON.parse(JSON.stringify(checkoutPost)) as Record<string, any>
  resourcePost.summary = 'Atomically hold merchant-authored resources and start immediate checkout'
  resourcePost.description = 'Reservable-resource offers must use this endpoint. Dry-run requires an Idempotency-Key and acquires a real expiring hold from the same production resolver used for payment.'
  resourcePost.parameters = [
    ...(resourcePost.parameters ?? []).filter((parameter: Record<string, unknown>) => parameter.name !== 'Idempotency-Key'),
    {
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      schema: { type: 'string', minLength: 16, maxLength: 255 },
      description: 'Use the exact same key for dry-run approval and the live payment request.',
    },
  ]
  const resourceResponse = resourcePost?.responses?.['200']?.content?.['application/json']?.schema
  if (resourceResponse?.properties) {
    Object.assign(resourceResponse.properties, {
      resources: reservableResourceResponseSchema(),
    })
  }
  spec.paths['/api/reservable-resources/checkout'] = { post: resourcePost }
  return spec
}
