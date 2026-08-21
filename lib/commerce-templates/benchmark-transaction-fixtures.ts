import type { ConfiguredOfferItem } from '../configured-offer'
import type { OfferConfigurationPricingErrorCode } from '../offer-configuration-pricing'
import type {
  OfferInputAffects,
  OfferInputField,
  OfferInputPricing,
} from '../offer-configuration'
import type { OfferTransactionConfiguration } from '../offer-transaction-configuration'
import type { ConditionalFulfillmentDecision } from '../conditional-fulfillment'
import type { CommerceTemplateRef } from './schema'

export type CommerceBenchmarkTransactionAdjustmentExpectation = {
  fieldKey: string
  amount: number
}

export type CommerceBenchmarkPricingExpectation =
  | {
      outcome: 'priced'
      baseAmount: number
      adjustmentAmount: number
      finalAmount: number
      adjustments: CommerceBenchmarkTransactionAdjustmentExpectation[]
    }
  | {
      outcome: 'blocked'
      code: OfferConfigurationPricingErrorCode
      fields: string[]
    }

export type CommerceBenchmarkFulfillmentExpectation = {
  decision: ConditionalFulfillmentDecision
  matchedRuleIds: string[]
}

export type CommerceBenchmarkStagedSettlementExpectation = {
  totalAmount: number
  currency: string
  stages: Array<{
    id: string
    amountCents: number
  }>
}

export type CommerceBenchmarkResourceExpectation = {
  requirements: Array<{
    poolId: string
    windowId?: string
    resolvedQuantity: number
  }>
}

export type CommerceBenchmarkTransactionFixture = {
  /** Synthetic QA data only. Never expose as merchant truth or a public example price. */
  benchmarkOnly: true
  id: string
  template: CommerceTemplateRef
  offer: ConfiguredOfferItem
  currency: string
  rawConfiguration: Record<string, unknown>
  expected: {
    normalizedConfiguration: OfferTransactionConfiguration
    pricing: CommerceBenchmarkPricingExpectation
    fulfillment?: CommerceBenchmarkFulfillmentExpectation
    stagedSettlement?: CommerceBenchmarkStagedSettlementExpectation
    resources?: CommerceBenchmarkResourceExpectation
  }
}

function syntheticOffer(
  name: string,
  price: string,
  customerInputs: OfferInputField[],
): ConfiguredOfferItem {
  return {
    name,
    description: 'Synthetic benchmark-only offer. Not merchant inventory and never public truth.',
    price,
    url: '',
    customerInputs,
  }
}

function selectField(
  key: string,
  label: string,
  values: string[],
  affects: OfferInputAffects[],
  pricing?: Extract<OfferInputPricing, { model: 'option-delta' }>,
  required = true,
): OfferInputField {
  return {
    key,
    label,
    valueType: 'single-select',
    required,
    options: values.map((value) => ({ value, label: value })),
    askBuyer: `Choose ${label.toLowerCase()}.`,
    affects,
    ...(pricing ? { pricing } : {}),
  }
}

function multiSelectField(
  key: string,
  label: string,
  values: string[],
  affects: OfferInputAffects[],
  pricing?: Extract<OfferInputPricing, { model: 'option-delta' }>,
): OfferInputField {
  return {
    key,
    label,
    valueType: 'multi-select',
    required: false,
    options: values.map((value) => ({ value, label: value })),
    askBuyer: `Choose any ${label.toLowerCase()}.`,
    affects,
    ...(pricing ? { pricing } : {}),
  }
}

function quantityField(
  key: string,
  label: string,
  affects: OfferInputAffects[],
  unitDelta: string,
  includedQuantity: number,
): OfferInputField {
  return {
    key,
    label,
    valueType: 'quantity',
    required: true,
    askBuyer: `How many ${label.toLowerCase()} do you need?`,
    affects,
    pricing: { model: 'quantity-delta', unitDelta, includedQuantity },
  }
}

function booleanField(
  key: string,
  label: string,
  affects: OfferInputAffects[],
  trueDelta: string,
): OfferInputField {
  return {
    key,
    label,
    valueType: 'boolean',
    required: false,
    askBuyer: `Would you like ${label.toLowerCase()}?`,
    affects,
    pricing: { model: 'boolean-delta', trueDelta },
  }
}

/**
 * At least one benchmark-only configured transaction fixture per active template.
 * A template may need multiple fixtures when v1 intentionally keeps incompatible
 * transaction contracts, such as inventory holds and staged settlement, separate.
 * The amounts below are synthetic QA constants. They exist solely to execute
 * production configuration/pricing code and must never seed merchant truth,
 * template knowledge, public examples, intake suggestions, or buyer answers.
 *
 * A fixture may expect a deterministic price OR an explicit fail-closed pricing
 * result. Quote-required patterns should not be forced into deterministic money.
 */
export const commerceBenchmarkTransactionFixtures: CommerceBenchmarkTransactionFixture[] = [
  {
    benchmarkOnly: true,
    id: 'home.recurring-home-cleaning.transaction',
    template: { id: 'home.recurring-home-cleaning', version: 1 },
    offer: syntheticOffer('Synthetic Recurring Clean', '$120', [
      selectField('cadence', 'Cadence', ['weekly', 'biweekly'], ['availability']),
      multiSelectField(
        'add-ons',
        'Add-ons',
        ['oven', 'fridge'],
        ['price', 'scope'],
        {
          model: 'option-delta',
          adjustments: [
            { value: 'oven', delta: '30' },
            { value: 'fridge', delta: '25' },
          ],
        },
      ),
    ]),
    currency: 'usd',
    rawConfiguration: { cadence: 'biweekly', 'add-ons': ['fridge', 'oven', 'fridge'] },
    expected: {
      normalizedConfiguration: { cadence: 'biweekly', 'add-ons': ['oven', 'fridge'] },
      pricing: {
        outcome: 'priced',
        baseAmount: 12000,
        adjustmentAmount: 5500,
        finalAmount: 17500,
        adjustments: [{ fieldKey: 'add-ons', amount: 5500 }],
      },
    },
  },
  {
    benchmarkOnly: true,
    id: 'automotive.mobile-auto-detailing.transaction',
    template: { id: 'automotive.mobile-auto-detailing', version: 1 },
    offer: syntheticOffer('Synthetic Mobile Detail', '$150', [
      selectField(
        'vehicle-class',
        'Vehicle class',
        ['sedan', 'suv', 'truck'],
        ['price', 'scope'],
        {
          model: 'option-delta',
          adjustments: [
            { value: 'suv', delta: '25' },
            { value: 'truck', delta: '40' },
          ],
        },
      ),
      selectField('package', 'Package', ['full', 'interior'], ['scope']),
    ]),
    currency: 'usd',
    rawConfiguration: { package: 'full', 'vehicle-class': 'suv' },
    expected: {
      normalizedConfiguration: { 'vehicle-class': 'suv', package: 'full' },
      pricing: {
        outcome: 'priced',
        baseAmount: 15000,
        adjustmentAmount: 2500,
        finalAmount: 17500,
        adjustments: [{ fieldKey: 'vehicle-class', amount: 2500 }],
      },
    },
  },
  {
    benchmarkOnly: true,
    id: 'events.event-photography.transaction',
    template: { id: 'events.event-photography', version: 1 },
    offer: syntheticOffer('Synthetic Event Photography', '$800', [
      selectField('event-type', 'Event type', ['corporate', 'private'], ['scope']),
      quantityField('hours', 'Coverage hours', ['price', 'duration'], '150', 4),
    ]),
    currency: 'usd',
    rawConfiguration: { 'event-type': 'corporate', hours: 6 },
    expected: {
      normalizedConfiguration: { 'event-type': 'corporate', hours: 6 },
      pricing: {
        outcome: 'priced',
        baseAmount: 80000,
        adjustmentAmount: 30000,
        finalAmount: 110000,
        adjustments: [{ fieldKey: 'hours', amount: 30000 }],
      },
    },
  },
  {
    benchmarkOnly: true,
    id: 'events.private-chef.transaction',
    template: { id: 'events.private-chef', version: 1 },
    offer: syntheticOffer('Synthetic Private Chef Dinner', '$400', [
      quantityField('guests', 'Guests', ['price', 'scope'], '75', 4),
      multiSelectField(
        'dietary-needs',
        'Dietary needs',
        ['vegetarian', 'gluten-free'],
        ['scope', 'eligibility'],
      ),
    ]),
    currency: 'usd',
    rawConfiguration: { guests: 6, 'dietary-needs': ['gluten-free'] },
    expected: {
      normalizedConfiguration: { guests: 6, 'dietary-needs': ['gluten-free'] },
      pricing: {
        outcome: 'priced',
        baseAmount: 40000,
        adjustmentAmount: 15000,
        finalAmount: 55000,
        adjustments: [{ fieldKey: 'guests', amount: 15000 }],
      },
    },
  },
  {
    benchmarkOnly: true,
    id: 'events.party-rentals.inventory-transaction',
    template: { id: 'events.party-rentals', version: 1 },
    offer: {
      ...syntheticOffer('Synthetic Inventory-Backed Rental', '$500', [
        quantityField('chair-count', 'Chairs', ['price', 'scope'], '5', 40),
        quantityField('table-count', 'Tables', ['price', 'scope'], '20', 5),
        selectField(
          'delivery-mode',
          'Delivery mode',
          ['pickup', 'delivery'],
          ['price', 'scope', 'eligibility'],
          {
            model: 'option-delta',
            adjustments: [{ value: 'delivery', delta: '100' }],
          },
        ),
        booleanField('setup', 'Setup', ['price', 'scope'], '125'),
        selectField('site-access', 'Site access', ['standard', 'restricted'], ['eligibility']),
      ]),
      source: 'nexez',
      fulfillmentRules: [
        {
          id: 'restricted-access-review',
          inputKey: 'site-access',
          operator: 'equals',
          value: 'restricted',
          decision: 'requires-review',
          reasonCode: 'delivery.restricted_access',
          message: 'Restricted site access requires merchant review before delivery can be confirmed.',
          nextAction: 'contact-merchant',
        },
      ],
      reservableResourceTerms: {
        schemaVersion: 1,
        requirements: [
          {
            poolId: '11111111-1111-4111-8111-111111111111',
            windowId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            quantity: { source: 'input', inputKey: 'chair-count' },
          },
          {
            poolId: '22222222-2222-4222-8222-222222222222',
            windowId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            quantity: { source: 'input', inputKey: 'table-count' },
          },
          {
            poolId: '33333333-3333-4333-8333-333333333333',
            windowId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            quantity: { source: 'fixed', value: 1 },
          },
        ],
      },
    },
    currency: 'usd',
    rawConfiguration: {
      'chair-count': 80,
      'table-count': 10,
      'delivery-mode': 'delivery',
      setup: true,
      'site-access': 'standard',
    },
    expected: {
      normalizedConfiguration: {
        'chair-count': 80,
        'table-count': 10,
        'delivery-mode': 'delivery',
        setup: true,
        'site-access': 'standard',
      },
      pricing: {
        outcome: 'priced',
        baseAmount: 50000,
        adjustmentAmount: 52500,
        finalAmount: 102500,
        adjustments: [
          { fieldKey: 'chair-count', amount: 20000 },
          { fieldKey: 'table-count', amount: 10000 },
          { fieldKey: 'delivery-mode', amount: 10000 },
          { fieldKey: 'setup', amount: 12500 },
        ],
      },
      fulfillment: { decision: 'eligible', matchedRuleIds: [] },
      resources: {
        requirements: [
          {
            poolId: '11111111-1111-4111-8111-111111111111',
            windowId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            resolvedQuantity: 80,
          },
          {
            poolId: '22222222-2222-4222-8222-222222222222',
            windowId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            resolvedQuantity: 10,
          },
          {
            poolId: '33333333-3333-4333-8333-333333333333',
            windowId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            resolvedQuantity: 1,
          },
        ],
      },
    },
  },
  {
    benchmarkOnly: true,
    id: 'events.party-rentals.staged-transaction',
    template: { id: 'events.party-rentals', version: 1 },
    offer: {
      ...syntheticOffer('Synthetic Merchant-Confirmed Event Package', '$2000', [
        selectField(
          'package',
          'Package',
          ['standard', 'premium'],
          ['price', 'scope'],
          {
            model: 'option-delta',
            adjustments: [{ value: 'premium', delta: '500' }],
          },
        ),
        selectField('site-access', 'Site access', ['standard', 'restricted'], ['eligibility']),
      ]),
      fulfillmentRules: [
        {
          id: 'restricted-access-review',
          inputKey: 'site-access',
          operator: 'equals',
          value: 'restricted',
          decision: 'requires-review',
          reasonCode: 'delivery.restricted_access',
          message: 'Restricted site access requires merchant review before delivery can be confirmed.',
          nextAction: 'contact-merchant',
        },
      ],
      stagedSettlementTerms: {
        schemaVersion: 1,
        paymentModel: 'staged-fixed-total',
        approvalPolicy: 'buyer-approves-each-stage',
        mutationPolicy: 'immutable-after-first-payment',
        stages: [
          { id: 'commitment', label: 'Reservation commitment', kind: 'commitment', allocationBps: 3000 },
          { id: 'completion', label: 'Fulfillment completion', kind: 'completion', allocationBps: 7000 },
        ],
      },
    },
    currency: 'usd',
    rawConfiguration: { package: 'premium', 'site-access': 'standard' },
    expected: {
      normalizedConfiguration: { package: 'premium', 'site-access': 'standard' },
      pricing: {
        outcome: 'priced',
        baseAmount: 200000,
        adjustmentAmount: 50000,
        finalAmount: 250000,
        adjustments: [{ fieldKey: 'package', amount: 50000 }],
      },
      fulfillment: { decision: 'eligible', matchedRuleIds: [] },
      stagedSettlement: {
        totalAmount: 250000,
        currency: 'usd',
        stages: [
          { id: 'commitment', amountCents: 75000 },
          { id: 'completion', amountCents: 175000 },
        ],
      },
    },
  },
  {
    benchmarkOnly: true,
    id: 'professional.business-strategy-session.transaction',
    template: { id: 'professional.business-strategy-session', version: 1 },
    offer: syntheticOffer('Synthetic Strategy Session', '$450', [
      selectField('focus', 'Focus', ['growth', 'operations'], ['scope']),
      booleanField('recording', 'Recording', ['price', 'scope'], '50'),
    ]),
    currency: 'usd',
    rawConfiguration: { focus: 'growth', recording: true },
    expected: {
      normalizedConfiguration: { focus: 'growth', recording: true },
      pricing: {
        outcome: 'priced',
        baseAmount: 45000,
        adjustmentAmount: 5000,
        finalAmount: 50000,
        adjustments: [{ fieldKey: 'recording', amount: 5000 }],
      },
    },
  },
  {
    benchmarkOnly: true,
    id: 'education.private-tutoring.transaction',
    template: { id: 'education.private-tutoring', version: 1 },
    offer: syntheticOffer('Synthetic Tutoring Package', '$90', [
      selectField('subject', 'Subject', ['calculus', 'chemistry'], ['scope']),
      quantityField('session-count', 'Sessions', ['price', 'scope'], '80', 1),
    ]),
    currency: 'usd',
    rawConfiguration: { subject: 'calculus', 'session-count': 3 },
    expected: {
      normalizedConfiguration: { subject: 'calculus', 'session-count': 3 },
      pricing: {
        outcome: 'priced',
        baseAmount: 9000,
        adjustmentAmount: 16000,
        finalAmount: 25000,
        adjustments: [{ fieldKey: 'session-count', amount: 16000 }],
      },
    },
  },
  {
    benchmarkOnly: true,
    id: 'professional.web-design-project.transaction',
    template: { id: 'professional.web-design-project', version: 1 },
    offer: syntheticOffer('Synthetic Web Design Project', '$2000', [
      {
        key: 'page-count',
        label: 'Page count',
        valueType: 'quantity',
        required: true,
        askBuyer: 'How many pages are in scope?',
        affects: ['price', 'scope'],
      },
    ]),
    currency: 'usd',
    rawConfiguration: { 'page-count': 5 },
    expected: {
      normalizedConfiguration: { 'page-count': 5 },
      pricing: {
        outcome: 'blocked',
        code: 'pricing_rule_unresolved',
        fields: ['page-count'],
      },
    },
  },
]
