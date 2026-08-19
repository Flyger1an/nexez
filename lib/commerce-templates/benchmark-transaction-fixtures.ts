import type { ConfiguredOfferItem } from '../configured-offer'
import type { OfferTransactionConfiguration } from '../offer-transaction-configuration'
import type { CommerceTemplateRef } from './schema'

export type CommerceBenchmarkTransactionAdjustmentExpectation = {
  fieldKey: string
  amount: number
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
    pricing: {
      baseAmount: number
      adjustmentAmount: number
      finalAmount: number
      adjustments: CommerceBenchmarkTransactionAdjustmentExpectation[]
    }
  }
}

function syntheticOffer(
  name: string,
  price: string,
  customerInputs: NonNullable<ConfiguredOfferItem['customerInputs']>,
): ConfiguredOfferItem {
  return {
    name,
    description: 'Synthetic benchmark-only offer. Not merchant inventory and never public truth.',
    price,
    url: '',
    customerInputs,
  }
}

/**
 * One benchmark-only configured transaction fixture per active pilot template.
 * These prices/rules exist solely to exercise production configuration and
 * deterministic pricing primitives. They must never be copied into templates,
 * example listings, merchant intake defaults, or buyer-facing recommendations.
 */
export const commerceBenchmarkTransactionFixtures: CommerceBenchmarkTransactionFixture[] = [
  {
    benchmarkOnly: true,
    id: 'home.recurring-home-cleaning.transaction',
    template: { id: 'home.recurring-home-cleaning', version: 1 },
    offer: syntheticOffer('Synthetic Recurring Clean', '$120', [
      {
        key: 'cadence',
        label: 'Cadence',
        valueType: 'single-select',
        required: true,
        options: [
          { value: 'weekly', label: 'Weekly' },
          { value: 'biweekly', label: 'Biweekly' },
        ],
        askBuyer: 'Choose a recurring cadence.',
        affects: ['availability'],
      },
      {
        key: 'add-ons',
        label: 'Add-ons',
        valueType: 'multi-select',
        required: false,
        options: [
          { value: 'oven', label: 'Oven' },
          { value: 'fridge', label: 'Refrigerator' },
        ],
        askBuyer: 'Choose any add-ons.',
        affects: ['price', 'scope'],
        pricing: {
          model: 'option-delta',
          adjustments: [
            { value: 'oven', delta: '30' },
            { value: 'fridge', delta: '25' },
          ],
        },
      },
    ]),
    currency: 'usd',
    rawConfiguration: {
      cadence: 'biweekly',
      'add-ons': ['fridge', 'oven', 'fridge'],
    },
    expected: {
      normalizedConfiguration: {
        cadence: 'biweekly',
        'add-ons': ['oven', 'fridge'],
      },
      pricing: {
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
      {
        key: 'vehicle-class',
        label: 'Vehicle class',
        valueType: 'single-select',
        required: true,
        options: [
          { value: 'sedan', label: 'Sedan' },
          { value: 'suv', label: 'SUV' },
          { value: 'truck', label: 'Truck' },
        ],
        askBuyer: 'Choose the vehicle class.',
        affects: ['price', 'scope'],
        pricing: {
          model: 'option-delta',
          adjustments: [
            { value: 'suv', delta: '25' },
            { value: 'truck', delta: '40' },
          ],
        },
      },
      {
        key: 'package',
        label: 'Package',
        valueType: 'single-select',
        required: true,
        options: [
          { value: 'full', label: 'Full detail' },
          { value: 'interior', label: 'Interior detail' },
        ],
        askBuyer: 'Choose a detailing package.',
        affects: ['scope'],
      },
    ]),
    currency: 'usd',
    rawConfiguration: {
      package: 'full',
      'vehicle-class': 'suv',
    },
    expected: {
      normalizedConfiguration: {
        'vehicle-class': 'suv',
        package: 'full',
      },
      pricing: {
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
      {
        key: 'event-type',
        label: 'Event type',
        valueType: 'single-select',
        required: true,
        options: [
          { value: 'corporate', label: 'Corporate' },
          { value: 'private', label: 'Private event' },
        ],
        askBuyer: 'Choose the event type.',
        affects: ['scope'],
      },
      {
        key: 'hours',
        label: 'Coverage hours',
        valueType: 'quantity',
        required: true,
        askBuyer: 'How many hours of coverage do you need?',
        affects: ['price', 'duration'],
        pricing: {
          model: 'quantity-delta',
          unitDelta: '150',
          includedQuantity: 4,
        },
      },
    ]),
    currency: 'usd',
    rawConfiguration: {
      'event-type': 'corporate',
      hours: 6,
    },
    expected: {
      normalizedConfiguration: {
        'event-type': 'corporate',
        hours: 6,
      },
      pricing: {
        baseAmount: 80000,
        adjustmentAmount: 30000,
        finalAmount: 110000,
        adjustments: [{ fieldKey: 'hours', amount: 30000 }],
      },
    },
  },
  {
    benchmarkOnly: true,
    id: 'hospitality.private-chef.transaction',
    template: { id: 'hospitality.private-chef', version: 1 },
    offer: syntheticOffer('Synthetic Private Chef Dinner', '$400', [
      {
        key: 'guests',
        label: 'Guests',
        valueType: 'quantity',
        required: true,
        askBuyer: 'How many guests are dining?',
        affects: ['price', 'scope'],
        pricing: {
          model: 'quantity-delta',
          unitDelta: '75',
          includedQuantity: 4,
        },
      },
      {
        key: 'dietary-needs',
        label: 'Dietary needs',
        valueType: 'multi-select',
        required: false,
        options: [
          { value: 'vegetarian', label: 'Vegetarian' },
          { value: 'gluten-free', label: 'Gluten-free' },
        ],
        askBuyer: 'Select any dietary needs.',
        affects: ['scope', 'eligibility'],
      },
    ]),
    currency: 'usd',
    rawConfiguration: {
      guests: 6,
      'dietary-needs': ['gluten-free'],
    },
    expected: {
      normalizedConfiguration: {
        guests: 6,
        'dietary-needs': ['gluten-free'],
      },
      pricing: {
        baseAmount: 40000,
        adjustmentAmount: 15000,
        finalAmount: 55000,
        adjustments: [{ fieldKey: 'guests', amount: 15000 }],
      },
    },
  },
  {
    benchmarkOnly: true,
    id: 'professional.business-strategy-session.transaction',
    template: { id: 'professional.business-strategy-session', version: 1 },
    offer: syntheticOffer('Synthetic Strategy Session', '$450', [
      {
        key: 'focus',
        label: 'Focus',
        valueType: 'single-select',
        required: true,
        options: [
          { value: 'growth', label: 'Growth' },
          { value: 'operations', label: 'Operations' },
        ],
        askBuyer: 'Choose the session focus.',
        affects: ['scope'],
      },
      {
        key: 'recording',
        label: 'Recording',
        valueType: 'boolean',
        required: false,
        askBuyer: 'Would you like a session recording?',
        affects: ['price', 'scope'],
        pricing: {
          model: 'boolean-delta',
          trueDelta: '50',
        },
      },
    ]),
    currency: 'usd',
    rawConfiguration: {
      focus: 'growth',
      recording: true,
    },
    expected: {
      normalizedConfiguration: {
        focus: 'growth',
        recording: true,
      },
      pricing: {
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
      {
        key: 'subject',
        label: 'Subject',
        valueType: 'single-select',
        required: true,
        options: [
          { value: 'calculus', label: 'Calculus' },
          { value: 'chemistry', label: 'Chemistry' },
        ],
        askBuyer: 'Choose a subject.',
        affects: ['scope'],
      },
      {
        key: 'session-count',
        label: 'Session count',
        valueType: 'quantity',
        required: true,
        askBuyer: 'How many sessions do you want?',
        affects: ['price', 'scope'],
        pricing: {
          model: 'quantity-delta',
          unitDelta: '80',
          includedQuantity: 1,
        },
      },
    ]),
    currency: 'usd',
    rawConfiguration: {
      subject: 'calculus',
      'session-count': 3,
    },
    expected: {
      normalizedConfiguration: {
        subject: 'calculus',
        'session-count': 3,
      },
      pricing: {
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
        key: 'package',
        label: 'Package',
        valueType: 'single-select',
        required: true,
        options: [
          { value: 'starter', label: 'Starter' },
          { value: 'growth', label: 'Growth' },
          { value: 'custom', label: 'Custom' },
        ],
        askBuyer: 'Choose a project package.',
        affects: ['price', 'scope'],
        pricing: {
          model: 'option-delta',
          adjustments: [
            { value: 'growth', delta: '1000' },
            { value: 'custom', delta: '2500' },
          ],
        },
      },
    ]),
    currency: 'usd',
    rawConfiguration: {
      package: 'growth',
    },
    expected: {
      normalizedConfiguration: {
        package: 'growth',
      },
      pricing: {
        baseAmount: 200000,
        adjustmentAmount: 100000,
        finalAmount: 300000,
        adjustments: [{ fieldKey: 'package', amount: 100000 }],
      },
    },
  },
]
