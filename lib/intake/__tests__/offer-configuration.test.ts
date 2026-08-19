import { describe, expect, it } from 'vitest'
import type { OfferItem } from '../../agent-page'
import { getOfferAttributes, getOfferCustomerInputs, type ConfiguredOfferItem } from '../../configured-offer'
import { applyIntakeAction, createIntakeState, normalizeOfferName } from '../reducer'
import { VOLUNTEERED_PREFIX, type IntakeAction, type IntakeExtraction, type IntakeSource, type IntakeState } from '../types'

const T0 = '2026-08-19T00:00:00.000Z'
const source: IntakeSource = { id: 'src-1', kind: 'url', value: 'https://detail.example', addedAt: T0 }

function offer(overrides: Partial<OfferItem> = {}): OfferItem {
  return {
    name: 'Mobile Detail',
    description: 'Interior and exterior detail',
    price: '$180',
    url: '',
    ...overrides,
  }
}

function extraction(overrides: Partial<IntakeExtraction> = {}): IntakeExtraction {
  return {
    sourceId: source.id,
    title: 'DFW Detail Co.',
    description: 'Mobile detailing.',
    website_url: source.value,
    offers: [offer()],
    industry: 'Auto Detailing',
    ...overrides,
  }
}

function run(state: IntakeState, ...actions: IntakeAction[]): IntakeState {
  let current = state
  for (const action of actions) {
    const result = applyIntakeAction(current, action)
    if (!result.ok) throw new Error(`Expected ok for ${action.type}, got ${result.code}: ${result.error}`)
    current = result.state
  }
  return current
}

function volunteered(fields: NonNullable<Extract<IntakeAction, { type: 'RECORD_ANSWERS' }>['answers'][number]['fields']>): IntakeAction {
  return {
    type: 'RECORD_ANSWERS',
    answers: [{ gapId: `${VOLUNTEERED_PREFIX}offer-config`, answer: 'Owner supplied configuration.', fields }],
  }
}

describe('intake structured offer configuration', () => {
  it('records merchant-authored buyer inputs with stated provenance', () => {
    const state = run(
      createIntakeState({ seed: { services: [offer()] } }),
      volunteered([
        {
          target: 'offer_input',
          offerKey: 'services-0',
          input: {
            key: 'vehicle_class',
            label: 'Vehicle class',
            valueType: 'single-select',
            required: true,
            options: [
              { value: 'sedan', label: 'Sedan' },
              { value: 'suv', label: 'SUV | crossover' },
            ],
            askBuyer: 'What kind of vehicle should we detail?',
            affects: ['price', 'duration'],
          },
        },
      ]),
    )

    expect(getOfferCustomerInputs(state.draft.services[0])).toEqual([
      {
        key: 'vehicle_class',
        label: 'Vehicle class',
        valueType: 'single-select',
        required: true,
        options: [
          { value: 'sedan', label: 'Sedan' },
          { value: 'suv', label: 'SUV | crossover' },
        ],
        askBuyer: 'What kind of vehicle should we detail?',
        affects: ['price', 'duration'],
      },
    ])
    expect(state.provenance[`offer:${normalizeOfferName('Mobile Detail')}:input:vehicle_class`]).toBe('stated')
  })

  it('records confirmed suggestions distinctly and keeps typed attribute values', () => {
    const state = run(
      createIntakeState({ seed: { services: [offer()] } }),
      volunteered([
        {
          target: 'offer_attribute',
          offerKey: 'services-0',
          origin: 'suggested',
          attribute: {
            key: 'water_required',
            label: 'Customer water required',
            valueType: 'boolean',
            value: false,
          },
        },
      ]),
    )

    expect(getOfferAttributes(state.draft.services[0])).toEqual([
      {
        key: 'water_required',
        label: 'Customer water required',
        valueType: 'boolean',
        value: false,
      },
    ])
    expect(state.provenance[`offer:${normalizeOfferName('Mobile Detail')}:attribute:water_required`]).toBe('suggested_confirmed')
  })

  it('rejects invalid configuration atomically and leaves the authoritative state untouched', () => {
    const original = createIntakeState({ seed: { services: [offer()] } })
    const action = volunteered([
      {
        target: 'offer_input',
        offerKey: 'services-0',
        input: {
          key: 'vehicle_class',
          label: 'Vehicle class',
          valueType: 'single-select',
          required: true,
          options: [],
          askBuyer: 'Vehicle?',
        },
      },
    ])

    const result = applyIntakeAction(original, action)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('invalid_field_update')
    expect(getOfferCustomerInputs(original.draft.services[0])).toEqual([])
    expect(original.answers).toEqual([])
  })

  it('upserts a repeated stable key instead of duplicating merchant configuration', () => {
    const seeded = createIntakeState({ seed: { services: [offer()] } })
    const once = run(
      seeded,
      volunteered([
        {
          target: 'offer_attribute',
          offerKey: 'services-0',
          attribute: { key: 'minimum_age', label: 'Minimum age', valueType: 'number', value: 16 },
        },
      ]),
    )
    const twice = run(
      once,
      volunteered([
        {
          target: 'offer_attribute',
          offerKey: 'services-0',
          attribute: { key: 'minimum_age', label: 'Minimum driver age', valueType: 'number', value: 18 },
        },
      ]),
    )

    expect(getOfferAttributes(twice.draft.services[0])).toEqual([
      { key: 'minimum_age', label: 'Minimum driver age', valueType: 'number', value: 18 },
    ])
  })

  it('migrates structured configuration provenance when the merchant renames an offer', () => {
    const configured = run(
      createIntakeState({ seed: { services: [offer()] } }),
      volunteered([
        {
          target: 'offer_input',
          offerKey: 'services-0',
          input: {
            key: 'vehicle_class',
            label: 'Vehicle class',
            valueType: 'text',
            required: true,
            askBuyer: 'What vehicle class?',
          },
        },
      ]),
    )

    const renamed = run(
      configured,
      volunteered([
        { target: 'offer', offerKey: 'services-0', field: 'name', value: 'Signature Mobile Detail' },
      ]),
    )

    expect(renamed.provenance[`offer:${normalizeOfferName('Mobile Detail')}:input:vehicle_class`]).toBeUndefined()
    expect(renamed.provenance[`offer:${normalizeOfferName('Signature Mobile Detail')}:input:vehicle_class`]).toBe('stated')
    expect(getOfferCustomerInputs(renamed.draft.services[0])[0].key).toBe('vehicle_class')
  })

  it('stamps validated configuration already present on seeded listings as imported', () => {
    const seededOffer = {
      ...offer(),
      customerInputs: [
        {
          key: 'vehicle_class',
          label: 'Vehicle class',
          valueType: 'text',
          required: true,
          askBuyer: 'Vehicle class?',
        },
      ],
      attributes: [
        { key: 'mobile', label: 'Mobile service', valueType: 'boolean', value: true },
      ],
    } as ConfiguredOfferItem

    const state = createIntakeState({ seed: { services: [seededOffer] } })
    const norm = normalizeOfferName('Mobile Detail')
    expect(state.provenance[`offer:${norm}:input:vehicle_class`]).toBe('imported')
    expect(state.provenance[`offer:${norm}:attribute:mobile`]).toBe('imported')
  })

  it('does not let propose_offers overwrite or invent structured merchant configuration', () => {
    let state = run(
      createIntakeState(),
      { type: 'ADD_SOURCE', source },
      { type: 'RECORD_EXTRACTION', extraction: extraction() },
    )
    state = run(
      state,
      volunteered([
        {
          target: 'offer_attribute',
          offerKey: 'services-0',
          attribute: { key: 'mobile', label: 'Mobile service', valueType: 'boolean', value: true },
        },
      ]),
    )

    const maliciousProposal = {
      ...offer({ description: 'Curated copy', price: '$170' }),
      attributes: [{ key: 'mobile', label: 'Mobile service', valueType: 'boolean', value: false }],
      customerInputs: [
        { key: 'invented', label: 'Invented', valueType: 'text', required: true, askBuyer: 'Invented?' },
      ],
    } as unknown as OfferItem

    const proposed = run(state, { type: 'PROPOSE_OFFERS', kind: 'services', offers: [maliciousProposal] })
    expect(proposed.draft.services[0].description).toBe('Curated copy')
    expect(getOfferAttributes(proposed.draft.services[0])).toEqual([
      { key: 'mobile', label: 'Mobile service', valueType: 'boolean', value: true },
    ])
    expect(getOfferCustomerInputs(proposed.draft.services[0])).toEqual([])
  })

  it('does not let new_offer smuggle configuration around the dedicated merchant-answer targets', () => {
    const smuggledOffer = {
      name: 'Ceramic Coating',
      description: 'Paint protection',
      price: '$700',
      url: '',
      attributes: [{ key: 'warranty_years', label: 'Warranty', valueType: 'number', value: 5 }],
      customerInputs: [
        { key: 'vehicle_class', label: 'Vehicle class', valueType: 'text', required: true, askBuyer: 'Vehicle?' },
      ],
    } as unknown as OfferItem

    const state = run(
      createIntakeState(),
      volunteered([{ target: 'new_offer', kind: 'services', offer: smuggledOffer }]),
    )

    expect(state.draft.services[0].name).toBe('Ceramic Coating')
    expect(getOfferAttributes(state.draft.services[0])).toEqual([])
    expect(getOfferCustomerInputs(state.draft.services[0])).toEqual([])
  })
})
