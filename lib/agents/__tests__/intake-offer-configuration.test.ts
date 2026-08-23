import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock } from '../../../test/supabase-mock'
import type { OfferItem } from '../../agent-page'
import { getOfferAttributes, getOfferCustomerInputs } from '../../configured-offer'
import { applyIntakeAction, createIntakeState, type IntakeState } from '../../intake'

const { captureEventMock } = vi.hoisted(() => ({ captureEventMock: vi.fn() }))
vi.mock('../../observability', () => ({
  captureEvent: captureEventMock,
  captureError: vi.fn(),
  isObservabilityConfigured: () => false,
}))

import { handleIntakeTurn, INTAKE_SYSTEM_PROMPT, type IntakeSessionRow } from '../intake'

const T0 = '2026-08-19T00:00:00.000Z'
const OWNER = { id: 'owner-commerce', email: 'owner@example.com' }

beforeEach(() => captureEventMock.mockClear())

function offer(): OfferItem {
  return {
    name: 'Mobile Detail',
    description: 'Interior and exterior detail',
    price: '$180',
    url: '',
    duration: '2 hours',
  }
}

function analyzedState(): IntakeState {
  let state = createIntakeState({
    seed: {
      name: 'DFW Detail Co.',
      description: 'Mobile auto detailing.',
      industry: 'Auto Detailing',
      location: 'Dallas-Fort Worth',
      services: [offer()],
    },
  })
  const added = applyIntakeAction(state, {
    type: 'ADD_SOURCE',
    source: { id: 'src-1', kind: 'none', value: '', addedAt: T0 },
  })
  if (!added.ok) throw new Error(added.error)
  state = added.state
  const analyzed = applyIntakeAction(state, { type: 'ANALYZE_GAPS' })
  if (!analyzed.ok) throw new Error(analyzed.error)
  return analyzed.state
}

function sessionRow(state: IntakeState): IntakeSessionRow {
  return {
    id: 'sess-commerce',
    owner_id: OWNER.id,
    page_id: null,
    status: 'active',
    phase: state.phase,
    state,
  }
}

function makeDb(row: IntakeSessionRow) {
  const captured: any[] = []
  const db = createSupabaseMock((ctx) => {
    if (ctx.table === 'intake_sessions' && ctx.op === 'select') return { data: row }
    if (ctx.table === 'intake_sessions' && ctx.op === 'update') {
      captured.push(ctx.payload)
      return { data: null }
    }
    return { data: null }
  })
  return { db: db as any, captured }
}

const toolCall = (name: string, args: unknown) => ({
  id: `call-${name}`,
  type: 'function' as const,
  function: { name, arguments: JSON.stringify(args) },
})

function ids() {
  let n = 0
  return { now: () => new Date(T0), newId: () => `id-${n++}` }
}

describe('Nexie offer configuration tool loop', () => {
  it('records explicit merchant configuration, exposes only the dedicated grammar, and blocks later proposal overwrite', async () => {
    const initial = analyzedState()
    const firstDb = makeDb(sessionRow(initial))
    const firstLlm = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: null,
            tool_calls: [toolCall('record_answers', {
              answers: [{
                gapId: 'volunteered:vehicle-configuration',
                answer: 'Ask what vehicle they have because size changes price and timing. We bring our own water.',
                fields: [
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
                        { value: 'suv', label: 'SUV' },
                        { value: 'truck', label: 'Truck' },
                      ],
                      askBuyer: 'What kind of vehicle should we detail?',
                      affects: ['price', 'duration'],
                    },
                  },
                  {
                    target: 'offer_attribute',
                    offerKey: 'services-0',
                    attribute: {
                      key: 'customer_water_required',
                      label: 'Customer water required',
                      valueType: 'boolean',
                      value: false,
                    },
                  },
                ],
              }],
            })],
          },
        }],
      })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Got it - vehicle size affects the job, and you bring your own water.' } }] })

    const first = await handleIntakeTurn(
      {
        db: firstDb.db,
        user: OWNER,
        sessionId: 'sess-commerce',
        content: 'Ask what vehicle they have because size changes price and timing. We bring our own water.',
      },
      { ...ids(), llm: firstLlm },
    )

    expect(first.ok).toBe(true)
    if (!first.ok) return

    const recordAnswersTool = (firstLlm.mock.calls[0][1] as any[]).find((tool) => tool.function?.name === 'record_answers')
    const fieldSchema = recordAnswersTool.function.parameters.properties.answers.items.properties.fields.items
    expect(fieldSchema.properties.target.enum).toContain('offer_input')
    expect(fieldSchema.properties.target.enum).toContain('offer_attribute')
    expect(fieldSchema.properties.input.properties.valueType.enum).toContain('asset')
    expect(fieldSchema.properties.attribute.properties.value.anyOf).toBeTruthy()
    expect(INTAKE_SYSTEM_PROMPT).toContain('Structured offer configuration is MERCHANT TRUTH, not template truth')

    expect(getOfferCustomerInputs(first.state.draft.services[0])).toEqual([
      {
        key: 'vehicle_class',
        label: 'Vehicle class',
        valueType: 'single-select',
        required: true,
        options: [
          { value: 'sedan', label: 'Sedan' },
          { value: 'suv', label: 'SUV' },
          { value: 'truck', label: 'Truck' },
        ],
        askBuyer: 'What kind of vehicle should we detail?',
        affects: ['price', 'duration'],
      },
    ])
    expect(getOfferAttributes(first.state.draft.services[0])).toEqual([
      {
        key: 'customer_water_required',
        label: 'Customer water required',
        valueType: 'boolean',
        value: false,
      },
    ])
    expect(first.state.provenance['offer:mobiledetail:input:vehicle_class']).toBe('stated')
    expect(first.state.provenance['offer:mobiledetail:attribute:customer_water_required']).toBe('stated')

    // Second real tool-loop turn: the model is allowed to curate scalar offer
    // presentation, but configuration hidden in propose_offers has zero authority.
    const secondDb = makeDb(sessionRow(first.state))
    const secondLlm = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: null,
            tool_calls: [toolCall('propose_offers', {
              kind: 'services',
              offers: [{
                ...offer(),
                price: '$170',
                description: 'Agent-curated copy',
                customerInputs: [
                  { key: 'invented', label: 'Invented', valueType: 'text', required: true, askBuyer: 'Invented?' },
                ],
                attributes: [
                  { key: 'customer_water_required', label: 'Customer water required', valueType: 'boolean', value: true },
                ],
              }],
            })],
          },
        }],
      })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'I kept the offer aligned with what you told me.' } }] })

    const second = await handleIntakeTurn(
      { db: secondDb.db, user: OWNER, sessionId: 'sess-commerce', content: 'Polish the offer wording.' },
      { ...ids(), llm: secondLlm },
    )

    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.state.draft.services[0].price).toBe('$170')
    expect(second.state.draft.services[0].description).toBe('Agent-curated copy')
    expect(getOfferCustomerInputs(second.state.draft.services[0]).map((field) => field.key)).toEqual(['vehicle_class'])
    expect(getOfferAttributes(second.state.draft.services[0])).toEqual([
      {
        key: 'customer_water_required',
        label: 'Customer water required',
        valueType: 'boolean',
        value: false,
      },
    ])
  })
})
