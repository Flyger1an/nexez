/**
 * Tool-schema fragments for merchant-authored Commerce Schema configuration.
 *
 * These are intentionally seller-side definitions only. They describe what the
 * merchant says a buyer must/may provide, public-safe facts, and deterministic
 * merchant-stated price deltas. Buyer-supplied values remain transaction data
 * and are NOT represented here.
 */

export const OFFER_INPUT_TOOL_SCHEMA = {
  type: 'object',
  description:
    'Merchant-confirmed buyer-input definition. Use only when the owner explicitly states or confirms this requirement; never infer it from a template or example.',
  properties: {
    key: {
      type: 'string',
      description: 'Stable snake_case key, e.g. vehicle_class, guest_count, project_assets.',
    },
    label: { type: 'string', description: 'Short merchant-facing/customer-facing label.' },
    description: { type: 'string', description: 'Optional clarification of what the buyer should provide.' },
    valueType: {
      type: 'string',
      enum: ['text', 'number', 'boolean', 'single-select', 'multi-select', 'quantity', 'date', 'date-time', 'location', 'asset'],
    },
    required: { type: 'boolean' },
    options: {
      type: 'array',
      description: 'Required for single-select/multi-select; omit for other value types.',
      maxItems: 25,
      items: {
        type: 'object',
        properties: {
          value: { type: 'string' },
          label: { type: 'string' },
        },
        required: ['value', 'label'],
      },
    },
    askBuyer: {
      type: 'string',
      description: 'Natural-language question a buyer agent can ask to collect this value later.',
    },
    affects: {
      type: 'array',
      uniqueItems: true,
      items: { type: 'string', enum: ['eligibility', 'price', 'duration', 'availability', 'scope'] },
      description: 'Which transaction decisions this buyer input can affect.',
    },
    pricing: {
      type: 'object',
      description:
        'Optional deterministic merchant-confirmed price delta. Never infer amounts. The page currency is implied. Supported only for select, boolean, and quantity inputs; the reducer validates the model against valueType/options.',
      properties: {
        model: {
          type: 'string',
          enum: ['option-delta', 'boolean-delta', 'quantity-delta'],
        },
        adjustments: {
          type: 'array',
          description: 'For option-delta only. Missing declared options imply zero delta.',
          maxItems: 25,
          items: {
            type: 'object',
            properties: {
              value: { type: 'string', description: 'Exact declared option value.' },
              delta: { type: 'string', description: 'Signed major-unit amount, e.g. "25", "12.50", or "-10".' },
            },
            required: ['value', 'delta'],
          },
        },
        trueDelta: { type: 'string', description: 'For boolean-delta: signed amount when true.' },
        falseDelta: { type: 'string', description: 'For boolean-delta: signed amount when false.' },
        unitDelta: { type: 'string', description: 'For quantity-delta: signed amount per unit above includedQuantity.' },
        includedQuantity: { type: 'integer', minimum: 0, maximum: 1000000 },
      },
      required: ['model'],
    },
  },
  required: ['key', 'label', 'valueType', 'required', 'askBuyer'],
} as const

export const OFFER_ATTRIBUTE_TOOL_SCHEMA = {
  type: 'object',
  description:
    'Merchant-confirmed public-safe offer fact/capability. Never put private negotiation floors, secrets, internal notes, or unconfirmed template assumptions here.',
  properties: {
    key: { type: 'string', description: 'Stable snake_case key, e.g. water_required, minimum_guests.' },
    label: { type: 'string' },
    valueType: {
      type: 'string',
      enum: ['text', 'number', 'boolean', 'single-select', 'multi-select', 'duration', 'quantity'],
    },
    value: {
      description: 'Typed value matching valueType.',
      anyOf: [
        { type: 'string' },
        { type: 'number' },
        { type: 'boolean' },
        { type: 'array', items: { type: 'string' } },
      ],
    },
  },
  required: ['key', 'label', 'valueType', 'value'],
} as const

export const OFFER_CONFIGURATION_PROMPT = `
- Structured offer configuration is MERCHANT TRUTH, not template truth. Use offer_input / offer_attribute ONLY when the owner explicitly states or confirms the underlying fact. A template, industry expectation, prior example, or your own intuition may justify ASKING; it may never supply the answer.
- Deterministic pricing is also MERCHANT TRUTH. Never invent a surcharge, discount, included quantity, percentage, or formula. Only record pricing after the merchant explicitly states or confirms the exact delta. Pricing is limited to option-delta, boolean-delta, and quantity-delta; no percentages, arbitrary formulas, or cross-field math.
- Price amounts are signed major-unit strings in the page currency: "25" means +25, "-10" means a 10-unit discount. If pricing is present, affects MUST include "price".
- Select pricing example after merchant confirmation: {"target":"offer_input","offerKey":"services-0","input":{"key":"vehicle_class","label":"Vehicle class","valueType":"single-select","required":true,"options":[{"value":"sedan","label":"Sedan"},{"value":"suv","label":"SUV"}],"askBuyer":"What kind of vehicle should we detail?","affects":["price","duration"],"pricing":{"model":"option-delta","adjustments":[{"value":"suv","delta":"25"}]}}}
- Quantity pricing example after merchant confirmation: {"target":"offer_input","offerKey":"services-0","input":{"key":"bedrooms","label":"Bedrooms","valueType":"quantity","required":true,"askBuyer":"How many bedrooms?","affects":["price","duration"],"pricing":{"model":"quantity-delta","unitDelta":"20","includedQuantity":2}}}
- Public-safe offer fact: {"target":"offer_attribute","offerKey":"services-0","attribute":{"key":"water_required","label":"Customer water required","valueType":"boolean","value":false}}
- If the owner confirms a fact YOU suggested, include "origin":"suggested" so provenance records suggested_confirmed. Never mark an unconfirmed suggestion as a fact.
- For a newly stated offer plus configuration in the same answer, emit new_offer FIRST, then offer_input / offer_attribute using the new offerKey. Never hide structured configuration inside new_offer or propose_offers.`
