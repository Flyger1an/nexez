import { describe, expect, it } from 'vitest'
import type { OfferItem } from '../../agent-page'
import { applyIntakeAction, createIntakeState, handoffEligible, normalizeOfferName } from '../reducer'
import {
  VOLUNTEERED_PREFIX,
  type GapAnswer,
  type IntakeAction,
  type IntakeExtraction,
  type IntakeSource,
  type IntakeState,
} from '../types'

// ---------------------------------------------------------------------------
// Fixtures - timestamps/ids are caller-supplied by design (the reducer is pure),
// so tests pin them.

const T0 = '2026-07-06T00:00:00.000Z'

const urlSource: IntakeSource = { id: 'src-1', kind: 'url', value: 'https://apex.example', addedAt: T0 }
const scratchSource: IntakeSource = { id: 'src-scratch', kind: 'none', value: '', addedAt: T0 }

function extraction(overrides: Partial<IntakeExtraction> = {}): IntakeExtraction {
  return {
    sourceId: 'src-1',
    title: 'Apex Catering Co.',
    description: 'Full-service catering for events.',
    website_url: 'https://apex.example',
    offers: [
      { name: 'Event Catering', description: 'Full service', price: '$1,200', url: '', duration: '4 hours' },
      { name: 'Drop-off Trays', description: 'Delivered trays', price: '', url: '' },
    ],
    faqs: [{ question: 'Do you deliver?', answer: 'Yes, within the metro.' }],
    industry: 'Catering',
    clarifyingQuestions: [{ id: 'q-aud', field: 'audience', question: 'Who is the core buyer?', why: 'Matching' }],
    ...overrides,
  }
}

/** Apply a sequence, asserting every step succeeds. */
function run(state: IntakeState, ...actions: IntakeAction[]): IntakeState {
  let current = state
  for (const action of actions) {
    const result = applyIntakeAction(current, action)
    if (!result.ok) throw new Error(`Expected ok for ${action.type}, got ${result.code}: ${result.error}`)
    current = result.state
  }
  return current
}

function expectError(state: IntakeState, action: IntakeAction, code: string) {
  const result = applyIntakeAction(state, action)
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.code).toBe(code)
}

/** The canonical happy path up to INTERVIEW. */
function interviewState(): IntakeState {
  return run(
    createIntakeState(),
    { type: 'ADD_SOURCE', source: urlSource },
    { type: 'RECORD_EXTRACTION', extraction: extraction() },
    { type: 'ANALYZE_GAPS' },
    { type: 'ASK_GAPS', gapIds: ['offer:services-1:price'] },
  )
}

// ---------------------------------------------------------------------------

describe('createIntakeState', () => {
  it('starts in INGEST with an empty draft', () => {
    const state = createIntakeState()
    expect(state.phase).toBe('INGEST')
    expect(state.draft.name).toBe('')
    expect(state.gaps).toEqual([])
    expect(state.handoff).toBeNull()
  })

  it('seeds a re-interview with imported provenance', () => {
    const state = createIntakeState({
      seed: { name: 'Existing Biz', services: [{ name: 'Old Offer', description: '', price: '$50', url: '' }] },
    })
    expect(state.draft.name).toBe('Existing Biz')
    expect(state.provenance['page:name']).toBe('imported')
    expect(state.provenance[`offer:${normalizeOfferName('Old Offer')}:price`]).toBe('imported')
  })
})

describe('INGEST → EXTRACT → GAP_ANALYSIS', () => {
  it('walks the machine in order and computes gaps', () => {
    const state = run(
      createIntakeState(),
      { type: 'ADD_SOURCE', source: urlSource },
      { type: 'RECORD_EXTRACTION', extraction: extraction() },
    )
    expect(state.phase).toBe('EXTRACT')
    const analyzed = run(state, { type: 'ANALYZE_GAPS' })
    expect(analyzed.phase).toBe('GAP_ANALYSIS')
    expect(analyzed.gaps.length).toBeGreaterThan(0)
    // the unpriced extracted offer is a blocking gap
    expect(analyzed.gaps.find((g) => g.id === 'offer:services-1:price')?.kind).toBe('blocking')
  })

  it('extraction folds with fill-empty semantics and imported provenance', () => {
    const state = run(
      createIntakeState(),
      { type: 'ADD_SOURCE', source: urlSource },
      { type: 'RECORD_EXTRACTION', extraction: extraction() },
    )
    expect(state.draft.name).toBe('Apex Catering Co.')
    expect(state.draft.industry).toBe('Catering')
    expect(state.draft.services).toHaveLength(2)
    expect(state.draft.faqs).toHaveLength(1)
    expect(state.provenance['page:name']).toBe('imported')
    expect(state.provenance[`offer:${normalizeOfferName('Event Catering')}:price`]).toBe('imported')
    // nothing became 'stated' - no answers exist
    expect(Object.values(state.provenance)).not.toContain('stated')
  })

  it('a second extraction never overwrites existing draft fields and dedups offers by name', () => {
    const base = run(
      createIntakeState(),
      { type: 'ADD_SOURCE', source: urlSource },
      { type: 'RECORD_EXTRACTION', extraction: extraction() },
      { type: 'ADD_SOURCE', source: { id: 'src-2', kind: 'text', value: 'pasted menu', addedAt: T0 } },
    )
    const state = run(base, {
      type: 'RECORD_EXTRACTION',
      extraction: extraction({
        sourceId: 'src-2',
        title: 'DIFFERENT NAME',
        offers: [
          { name: 'Event Catering', description: 'dupe', price: '$999', url: '' }, // dupe name → skipped
          { name: 'Bar Service', description: 'Mobile bar', price: '$400', url: '' },
        ],
      }),
    })
    expect(state.draft.name).toBe('Apex Catering Co.') // fill-empty: not overwritten
    expect(state.draft.services.map((o) => o.name)).toEqual(['Event Catering', 'Drop-off Trays', 'Bar Service'])
    expect(state.draft.services[0].price).toBe('$1,200') // dupe did not clobber
  })

  it('rejects an extraction for an unknown source', () => {
    const state = run(createIntakeState(), { type: 'ADD_SOURCE', source: urlSource })
    expectError(state, { type: 'RECORD_EXTRACTION', extraction: extraction({ sourceId: 'nope' }) }, 'unknown_source')
  })

  it('ANALYZE_GAPS requires a source but supports starting from scratch', () => {
    expectError(createIntakeState(), { type: 'ANALYZE_GAPS' }, 'no_sources')
    const scratch = run(createIntakeState(), { type: 'ADD_SOURCE', source: scratchSource }, { type: 'ANALYZE_GAPS' })
    expect(scratch.phase).toBe('GAP_ANALYSIS')
    expect(scratch.gaps.find((g) => g.id === 'page:name')?.kind).toBe('blocking')
  })

  it('ANALYZE_GAPS is not re-runnable mid-interview (RECORD_ANSWERS re-analyzes internally)', () => {
    expectError(interviewState(), { type: 'ANALYZE_GAPS' }, 'invalid_phase')
  })

  it('ADD_SOURCE replay with the same id is idempotent', () => {
    const once = run(createIntakeState(), { type: 'ADD_SOURCE', source: urlSource })
    const twice = run(once, { type: 'ADD_SOURCE', source: urlSource })
    expect(twice.sources).toHaveLength(1)
  })
})

describe('ASK_GAPS - the 1–3 batch rule', () => {
  it('moves to INTERVIEW and records the asked ids', () => {
    const state = interviewState()
    expect(state.phase).toBe('INTERVIEW')
    expect(state.askedGapIds).toEqual(['offer:services-1:price'])
  })

  it('rejects before analysis, empty batches, oversized batches, and unknown gaps', () => {
    const preAnalysis = run(createIntakeState(), { type: 'ADD_SOURCE', source: urlSource })
    expectError(preAnalysis, { type: 'ASK_GAPS', gapIds: ['page:name'] }, 'invalid_phase')

    const analyzed = run(preAnalysis, { type: 'RECORD_EXTRACTION', extraction: extraction() }, { type: 'ANALYZE_GAPS' })
    expectError(analyzed, { type: 'ASK_GAPS', gapIds: [] }, 'empty_gap_batch')
    const four = analyzed.gaps.slice(0, 4).map((g) => g.id)
    expectError(analyzed, { type: 'ASK_GAPS', gapIds: four }, 'gap_batch_too_large')
    expectError(analyzed, { type: 'ASK_GAPS', gapIds: ['made-up-gap'] }, 'unknown_gap')
  })

  it('appends the agent message exactly once (replay-safe)', () => {
    const analyzed = run(
      createIntakeState(),
      { type: 'ADD_SOURCE', source: urlSource },
      { type: 'RECORD_EXTRACTION', extraction: extraction() },
      { type: 'ANALYZE_GAPS' },
    )
    const message = { id: 'm-1', role: 'agent' as const, content: 'Quick one - what do the trays cost?', at: T0 }
    const asked = run(analyzed, { type: 'ASK_GAPS', gapIds: ['offer:services-1:price'], message })
    const askedAgain = run(asked, { type: 'ASK_GAPS', gapIds: ['imp:q-aud'], message })
    expect(askedAgain.messages).toHaveLength(1)
  })
})

describe('RECORD_ANSWERS - folding + SYNTHESIS', () => {
  const priceAnswer: GapAnswer = {
    gapId: 'offer:services-1:price',
    answer: 'Trays start at $250.',
    fields: [{ target: 'offer', offerKey: 'services-1', field: 'price', value: 'From $250' }],
  }

  it('folds the answer, marks stated provenance, moves to SYNTHESIS, and retires the covered gap', () => {
    const state = run(interviewState(), { type: 'RECORD_ANSWERS', answers: [priceAnswer] })
    expect(state.phase).toBe('SYNTHESIS')
    expect(state.draft.services[1].price).toBe('From $250')
    expect(state.provenance[`offer:${normalizeOfferName('Drop-off Trays')}:price`]).toBe('stated')
    expect(state.gaps.map((g) => g.id)).not.toContain('offer:services-1:price')
  })

  it('is idempotent - replaying the same answer batch yields the identical state', () => {
    const once = run(interviewState(), { type: 'RECORD_ANSWERS', answers: [priceAnswer] })
    const twice = run(once, { type: 'RECORD_ANSWERS', answers: [priceAnswer] })
    expect(twice).toEqual(once)
  })

  it('a re-answer supersedes the prior one (deduped by gapId)', () => {
    const first = run(interviewState(), { type: 'RECORD_ANSWERS', answers: [priceAnswer] })
    const corrected: GapAnswer = {
      ...priceAnswer,
      answer: 'Actually $300.',
      fields: [{ target: 'offer', offerKey: 'services-1', field: 'price', value: '$300' }],
    }
    const second = run(first, { type: 'RECORD_ANSWERS', answers: [corrected] })
    expect(second.draft.services[1].price).toBe('$300')
    expect(second.answers.filter((a) => a.gapId === priceAnswer.gapId)).toHaveLength(1)
  })

  it('skip is recorded without touching the draft, and the gap stays retired', () => {
    const state = run(interviewState(), {
      type: 'RECORD_ANSWERS',
      answers: [{ gapId: 'offer:services-1:price', answer: 'skip', skipped: true }],
    })
    expect(state.draft.services[1].price).toBe('')
    expect(state.gaps.map((g) => g.id)).not.toContain('offer:services-1:price')
    expect(Object.values(state.provenance)).not.toContain('stated')
  })

  it('volunteered facts are recordable in any pre-handoff phase; gap-referencing answers are not', () => {
    const ingest = run(createIntakeState(), { type: 'ADD_SOURCE', source: urlSource })
    const volunteered: GapAnswer = {
      gapId: `${VOLUNTEERED_PREFIX}page:location`,
      answer: 'We are in Austin.',
      fields: [{ target: 'page', field: 'location', value: 'Austin, TX' }],
    }
    const state = run(ingest, { type: 'RECORD_ANSWERS', answers: [volunteered] })
    expect(state.phase).toBe('INGEST') // no phase jump before analysis
    expect(state.draft.location).toBe('Austin, TX')
    expect(state.provenance['page:location']).toBe('stated')

    expectError(ingest, { type: 'RECORD_ANSWERS', answers: [{ gapId: 'page:name', answer: 'Apex' }] }, 'unknown_gap')
  })

  it('rejects unknown gaps and is all-or-nothing on invalid updates', () => {
    const state = interviewState()
    expectError(state, { type: 'RECORD_ANSWERS', answers: [{ gapId: 'nope', answer: 'x' }] }, 'unknown_gap')

    const mixed: GapAnswer[] = [
      priceAnswer,
      {
        gapId: `${VOLUNTEERED_PREFIX}broken`,
        answer: 'bad',
        fields: [{ target: 'offer', offerKey: 'services-99', field: 'price', value: '$1' }],
      },
    ]
    const result = applyIntakeAction(state, { type: 'RECORD_ANSWERS', answers: mixed })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('unknown_offer_key')
    // nothing from the valid half leaked into state
    expect(state.draft.services[1].price).toBe('')
  })

  it('validates offer field updates (offerType enum, string coercion for isMobile)', () => {
    const state = interviewState()
    expectError(
      state,
      {
        type: 'RECORD_ANSWERS',
        answers: [{ gapId: `${VOLUNTEERED_PREFIX}x`, answer: 'x', fields: [{ target: 'offer', offerKey: 'services-0', field: 'offerType', value: 'haggle' }] }],
      },
      'invalid_field_update',
    )
    const mobile = run(state, {
      type: 'RECORD_ANSWERS',
      answers: [{ gapId: `${VOLUNTEERED_PREFIX}m`, answer: 'we travel', fields: [{ target: 'offer', offerKey: 'services-0', field: 'isMobile', value: 'true' }] }],
    })
    expect(mobile.draft.services[0].isMobile).toBe(true)
  })

  it('offer_rules merge marks the offer negotiable and satisfies the floor gap', () => {
    const applied = applyIntakeAction(interviewState(), {
      type: 'RECORD_ANSWERS',
      answers: [
        {
          gapId: `${VOLUNTEERED_PREFIX}rules`,
          answer: 'I would go down to $900 with 48h notice',
          fields: [{ target: 'offer_rules', offerKey: 'services-0', rules: { minPrice: '$900', minNoticeHours: 48 } }],
        },
      ],
    }, { negotiationAllowed: true })
    if (!applied.ok) throw new Error(applied.error)
    const state = applied.state
    expect(state.draft.services[0].offerType).toBe('negotiable')
    expect(state.draft.services[0].rules).toEqual({ minPrice: '$900', minNoticeHours: 48 })
    expect(state.gaps.map((g) => g.id)).not.toContain('offer:services-0:floor')
  })

  it('fails closed on newly-authored negotiation posture and rules below Pro', () => {
    const state = interviewState()
    const posture = applyIntakeAction(state, {
      type: 'RECORD_ANSWERS',
      answers: [{
        gapId: `${VOLUNTEERED_PREFIX}posture`,
        answer: 'Open to offers',
        fields: [{ target: 'offer', offerKey: 'services-0', field: 'offerType', value: 'negotiable' }],
      }],
    })
    expect(posture).toMatchObject({ ok: false, code: 'feature_not_available' })
    expect(state.draft.services[0].offerType).toBeUndefined()

    const rules = applyIntakeAction(state, {
      type: 'RECORD_ANSWERS',
      answers: [{
        gapId: `${VOLUNTEERED_PREFIX}rules`,
        answer: 'Floor is $900',
        fields: [{ target: 'offer_rules', offerKey: 'services-0', rules: { minPrice: '$900' } }],
      }],
    })
    expect(rules).toMatchObject({ ok: false, code: 'feature_not_available' })
    expect(state.draft.services[0].rules).toBeUndefined()
  })

  it('allows structured core and unknown offer rules below Pro without changing posture', () => {
    const state = interviewState()
    const applied = applyIntakeAction(state, {
      type: 'RECORD_ANSWERS',
      answers: [{
        gapId: `${VOLUNTEERED_PREFIX}core-rules`,
        answer: '48 hours notice and setup are included',
        fields: [{
          target: 'offer_rules',
          offerKey: 'services-0',
          rules: { minNoticeHours: 48, includedScope: 'Setup', futureCoreRule: 'allowed' } as any,
        }],
      }],
    })

    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    expect(applied.state.draft.services[0].offerType).toBeUndefined()
    expect(applied.state.draft.services[0].rules).toEqual({
      minNoticeHours: 48,
      includedScope: 'Setup',
      futureCoreRule: 'allowed',
    })
  })

  it('allows retained downgraded configuration, ordinary edits, renames, and explicit Fixed cleanup', () => {
    const retained = createIntakeState({
      seed: {
        services: [{
          name: 'Retained Offer',
          description: 'Existing Pro configuration',
          price: '$1,200',
          url: '',
          offerType: 'negotiable',
          rules: { minPrice: '$900', minNoticeHours: 48 },
        }],
      },
    })

    const edited = applyIntakeAction(retained, {
      type: 'RECORD_ANSWERS',
      answers: [{
        gapId: `${VOLUNTEERED_PREFIX}description`,
        answer: 'Update the description',
        fields: [{ target: 'offer', offerKey: 'services-0', field: 'description', value: 'Updated copy' }],
      }],
    })
    expect(edited.ok).toBe(true)
    if (!edited.ok) return
    expect(edited.state.draft.services[0]).toMatchObject({
      description: 'Updated copy',
      offerType: 'negotiable',
      rules: { minPrice: '$900', minNoticeHours: 48 },
    })

    const coreEdited = applyIntakeAction(edited.state, {
      type: 'RECORD_ANSWERS',
      answers: [{
        gapId: `${VOLUNTEERED_PREFIX}core-rule-change`,
        answer: 'Make notice 72 hours',
        fields: [{ target: 'offer_rules', offerKey: 'services-0', rules: { minNoticeHours: 72 } }],
      }],
    })
    expect(coreEdited.ok).toBe(true)
    if (!coreEdited.ok) return
    expect(coreEdited.state.draft.services[0].rules).toEqual({ minPrice: '$900', minNoticeHours: 72 })

    const renamed = applyIntakeAction(coreEdited.state, {
      type: 'RECORD_ANSWERS',
      answers: [{
        gapId: `${VOLUNTEERED_PREFIX}rename`,
        answer: 'Rename it',
        fields: [{ target: 'offer', offerKey: 'services-0', field: 'name', value: 'Renamed Offer' }],
      }],
    })
    expect(renamed.ok).toBe(true)
    if (!renamed.ok) return
    expect(renamed.state.draft.services[0].offerType).toBe('negotiable')

    const mutated = applyIntakeAction(renamed.state, {
      type: 'RECORD_ANSWERS',
      answers: [{
        gapId: `${VOLUNTEERED_PREFIX}rules-change`,
        answer: 'Lower the floor',
        fields: [{ target: 'offer_rules', offerKey: 'services-0', rules: { minPrice: '$700' } }],
      }],
    })
    expect(mutated).toMatchObject({ ok: false, code: 'feature_not_available' })

    const cleared = applyIntakeAction(renamed.state, {
      type: 'RECORD_ANSWERS',
      answers: [{
        gapId: `${VOLUNTEERED_PREFIX}fixed`,
        answer: 'Make it fixed',
        fields: [{ target: 'offer', offerKey: 'services-0', field: 'offerType', value: 'fixed' }],
      }],
    })
    expect(cleared.ok).toBe(true)
    if (!cleared.ok) return
    expect(cleared.state.draft.services[0].offerType).toBe('fixed')
    expect(cleared.state.draft.services[0].rules).toEqual({ minNoticeHours: 72 })
  })

  it('rejects LLM curation that adds negotiable configuration below Pro', () => {
    const state = interviewState()
    const proposed = applyIntakeAction(state, {
      type: 'PROPOSE_OFFERS',
      kind: 'services',
      offers: [{
        ...state.draft.services[0],
        offerType: 'negotiable',
        rules: { minPrice: '$900' },
      }],
    })
    expect(proposed).toMatchObject({ ok: false, code: 'feature_not_available' })
    expect(state.draft.services[0].offerType).toBeUndefined()
  })

  it('allows LLM curation to add core rules below Pro', () => {
    const state = interviewState()
    const proposed = applyIntakeAction(state, {
      type: 'PROPOSE_OFFERS',
      kind: 'services',
      offers: [{
        ...state.draft.services[0],
        rules: { maxBookingsPerWeek: 4, excludedScope: 'Travel' },
      }],
    })
    expect(proposed.ok).toBe(true)
    if (!proposed.ok) return
    expect(proposed.state.draft.services[0].offerType).toBeUndefined()
    expect(proposed.state.draft.services[0].rules).toEqual({ maxBookingsPerWeek: 4, excludedScope: 'Travel' })
  })

  it('new_offer appends (stated), merges on name collision, and requires a name', () => {
    const newOffer: OfferItem = { name: 'Bar Service', description: 'Mobile bar', price: '$400', url: '' }
    const state = run(interviewState(), {
      type: 'RECORD_ANSWERS',
      answers: [{ gapId: `${VOLUNTEERED_PREFIX}bar`, answer: 'we also do bar service', fields: [{ target: 'new_offer', kind: 'services', offer: newOffer }] }],
    })
    expect(state.draft.services.map((o) => o.name)).toContain('Bar Service')
    expect(state.provenance[`offer:${normalizeOfferName('Bar Service')}:price`]).toBe('stated')

    // restating the same offer merges instead of duplicating
    const merged = run(state, {
      type: 'RECORD_ANSWERS',
      answers: [
        { gapId: `${VOLUNTEERED_PREFIX}bar2`, answer: 'bar is $450 actually', fields: [{ target: 'new_offer', kind: 'services', offer: { ...newOffer, price: '$450' } }] },
      ],
    })
    expect(merged.draft.services.filter((o) => o.name === 'Bar Service')).toHaveLength(1)
    expect(merged.draft.services.find((o) => o.name === 'Bar Service')?.price).toBe('$450')

    expectError(
      state,
      { type: 'RECORD_ANSWERS', answers: [{ gapId: `${VOLUNTEERED_PREFIX}anon`, answer: 'x', fields: [{ target: 'new_offer', kind: 'services', offer: { name: '', description: '', price: '', url: '' } }] }] },
      'invalid_field_update',
    )
  })

  it('faq updates add and upsert by question', () => {
    const state = run(interviewState(), {
      type: 'RECORD_ANSWERS',
      answers: [{ gapId: `${VOLUNTEERED_PREFIX}faq`, answer: 'yes we are insured', fields: [{ target: 'faq', question: 'Are you insured?', answer: 'Yes, fully.' }] }],
    })
    expect(state.draft.faqs.find((f) => f.question === 'Are you insured?')?.answer).toBe('Yes, fully.')
    expectError(
      state,
      { type: 'RECORD_ANSWERS', answers: [{ gapId: `${VOLUNTEERED_PREFIX}faq2`, answer: 'x', fields: [{ target: 'faq', question: 'Empty?', answer: ' ' }] }] },
      'invalid_field_update',
    )
  })

  it('renaming an offer migrates its provenance keys so stated protection survives', () => {
    // State a price, then rename the offer, then let the LLM re-propose stale data
    // under the new name - the stated price must still win.
    const state = run(interviewState(), {
      type: 'RECORD_ANSWERS',
      answers: [
        { gapId: 'offer:services-1:price', answer: '$250', fields: [{ target: 'offer', offerKey: 'services-1', field: 'price', value: '$250' }] },
        { gapId: `${VOLUNTEERED_PREFIX}rename`, answer: 'call them Party Trays', fields: [{ target: 'offer', offerKey: 'services-1', field: 'name', value: 'Party Trays' }] },
      ],
    })
    expect(state.draft.services[1].name).toBe('Party Trays')
    expect(state.provenance[`offer:${normalizeOfferName('Party Trays')}:price`]).toBe('stated')
    expect(state.provenance[`offer:${normalizeOfferName('Drop-off Trays')}:price`]).toBeUndefined()

    const proposed = run(state, {
      type: 'PROPOSE_OFFERS',
      kind: 'services',
      offers: [{ name: 'Party Trays', description: 'stale', price: '', url: '' }],
    })
    expect(proposed.draft.services.find((o) => o.name === 'Party Trays')?.price).toBe('$250')
  })

  it('rejects malformed LLM field updates loudly - never a silent no-op', () => {
    const state = interviewState()
    // fields not an array
    expectError(
      state,
      { type: 'RECORD_ANSWERS', answers: [{ gapId: `${VOLUNTEERED_PREFIX}x`, answer: 'x', fields: '[{"target":"page"}]' as never }] },
      'invalid_field_update',
    )
    // update without a target (the exact live-pass failure: {name, value})
    expectError(
      state,
      { type: 'RECORD_ANSWERS', answers: [{ gapId: `${VOLUNTEERED_PREFIX}x`, answer: 'x', fields: [{ name: 'audience', value: 'realtors' } as never] }] },
      'invalid_field_update',
    )
    // unknown target value
    expectError(
      state,
      { type: 'RECORD_ANSWERS', answers: [{ gapId: `${VOLUNTEERED_PREFIX}x`, answer: 'x', fields: [{ target: 'pages', field: 'name', value: 'X' } as never] }] },
      'invalid_field_update',
    )
    // and nothing leaked into the draft
    expect(state.draft.audience).toBe('')
  })

  it('suggested_confirmed provenance flows from origin: suggested', () => {
    const state = run(interviewState(), {
      type: 'RECORD_ANSWERS',
      answers: [
        { gapId: `${VOLUNTEERED_PREFIX}aud`, answer: 'yes, that fits', fields: [{ target: 'page', field: 'audience', value: 'Corporate event planners', origin: 'suggested' }] },
      ],
    })
    expect(state.provenance['page:audience']).toBe('suggested_confirmed')
  })
})

describe('provenance integrity - stated requires a GapAnswer (structural)', () => {
  it('extractions and proposals alone can never produce stated provenance', () => {
    const state = run(
      createIntakeState(),
      { type: 'ADD_SOURCE', source: urlSource },
      { type: 'RECORD_EXTRACTION', extraction: extraction() },
      { type: 'ANALYZE_GAPS' },
      { type: 'PROPOSE_OFFERS', kind: 'services', offers: [{ name: 'Event Catering', description: 'curated', price: '$1,200', url: '' }] },
    )
    const marks = Object.values(state.provenance)
    expect(marks).not.toContain('stated')
    expect(marks).not.toContain('suggested_confirmed')
    expect(state.answers).toHaveLength(0)
  })

  it('every stated/confirmed key traces back to a recorded answer', () => {
    const state = run(interviewState(), {
      type: 'RECORD_ANSWERS',
      answers: [
        { gapId: 'offer:services-1:price', answer: '$250', fields: [{ target: 'offer', offerKey: 'services-1', field: 'price', value: '$250' }] },
        { gapId: `${VOLUNTEERED_PREFIX}page:location`, answer: 'Austin', fields: [{ target: 'page', field: 'location', value: 'Austin, TX' }] },
      ],
    })
    const statedKeys = Object.entries(state.provenance).filter(([, p]) => p !== 'imported')
    expect(statedKeys.length).toBeGreaterThan(0)
    // the invariant: stated marks exist only alongside recorded answers
    expect(state.answers.length).toBeGreaterThan(0)
    for (const [key] of statedKeys) {
      const touched = state.answers.some((a) =>
        (a.fields ?? []).some((f) => {
          if (f.target === 'page') return key === `page:${f.field}`
          if (f.target === 'offer') return key.startsWith('offer:') && key.endsWith(`:${f.field}`)
          if (f.target === 'offer_rules') return key.startsWith('offer:') && key.endsWith(':rules')
          if (f.target === 'new_offer') return key.startsWith(`offer:${normalizeOfferName(f.offer.name)}:`)
          if (f.target === 'faq') return key.startsWith('faq:')
          return false
        }),
      )
      expect(touched, `provenance key ${key} has no backing answer`).toBe(true)
    }
  })
})

describe('PROPOSE_OFFERS - the invention firewall', () => {
  it('rejects offers not derived from extraction or stated answers, leaving state untouched', () => {
    const state = run(
      createIntakeState(),
      { type: 'ADD_SOURCE', source: urlSource },
      { type: 'RECORD_EXTRACTION', extraction: extraction() },
    )
    const before = state.draft.services.map((o) => o.name)
    expectError(
      state,
      { type: 'PROPOSE_OFFERS', kind: 'services', offers: [{ name: 'Invented Premium Package', description: '', price: '$9,999', url: '' }] },
      'invented_offer',
    )
    expect(state.draft.services.map((o) => o.name)).toEqual(before)
  })

  it('rejects proposals before anything is ingested', () => {
    expectError(
      createIntakeState(),
      { type: 'PROPOSE_OFFERS', kind: 'services', offers: [{ name: 'Anything', description: '', price: '', url: '' }] },
      'invalid_phase',
    )
  })

  it('curates the target kind, keeps stated fields, and retains stated offers the proposal dropped', () => {
    // Owner states a price correction + adds an offer, then the LLM re-proposes stale data.
    const base = run(interviewState(), {
      type: 'RECORD_ANSWERS',
      answers: [
        { gapId: 'offer:services-1:price', answer: '$250', fields: [{ target: 'offer', offerKey: 'services-1', field: 'price', value: '$250' }] },
        { gapId: `${VOLUNTEERED_PREFIX}bar`, answer: 'add bar service', fields: [{ target: 'new_offer', kind: 'services', offer: { name: 'Bar Service', description: 'Mobile bar', price: '$400', url: '' } }] },
      ],
    })
    const proposed = run(base, {
      type: 'PROPOSE_OFFERS',
      kind: 'services',
      offers: [
        { name: 'Event Catering', description: 'polished description', price: '$1,200', url: '' },
        { name: 'Drop-off Trays', description: 'Delivered trays', price: '', url: '' }, // stale empty price
      ],
    })
    const names = proposed.draft.services.map((o) => o.name)
    expect(names).toEqual(['Event Catering', 'Drop-off Trays', 'Bar Service']) // stated offer retained
    expect(proposed.draft.services[1].price).toBe('$250') // stated price survives the stale proposal
    expect(proposed.draft.services[0].description).toBe('polished description') // curation applies elsewhere
  })

  it('recategorizing an offer moves it between kinds without duplication', () => {
    const state = run(
      createIntakeState(),
      { type: 'ADD_SOURCE', source: urlSource },
      { type: 'RECORD_EXTRACTION', extraction: extraction() },
      { type: 'PROPOSE_OFFERS', kind: 'products', offers: [{ name: 'Drop-off Trays', description: 'Delivered trays', price: '$250', url: '' }] },
    )
    expect(state.draft.products.map((o) => o.name)).toEqual(['Drop-off Trays'])
    expect(state.draft.services.map((o) => o.name)).toEqual(['Event Catering'])
  })
})

describe('handoff - agent-gated, owner-free', () => {
  it('the agent cannot hand off while blocking gaps remain', () => {
    const state = interviewState() // Drop-off Trays has no price → blocking
    expect(handoffEligible(state)).toBe(false)
    const result = applyIntakeAction(state, { type: 'REQUEST_HANDOFF', at: T0 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('blocking_gaps_remain')
      expect(result.error).toContain('offer:services-1:price')
    }
  })

  it('resolving the blocking gap unlocks agent handoff', () => {
    const answered = run(interviewState(), {
      type: 'RECORD_ANSWERS',
      answers: [{ gapId: 'offer:services-1:price', answer: '$250', fields: [{ target: 'offer', offerKey: 'services-1', field: 'price', value: '$250' }] }],
    })
    expect(handoffEligible(answered)).toBe(true)
    const done = run(answered, { type: 'REQUEST_HANDOFF', at: T0 })
    expect(done.phase).toBe('REVIEW_HANDOFF')
    expect(done.handoff).toEqual({ via: 'agent', at: T0 })
  })

  it('skipping a blocking gap is the owner\'s call and also unlocks handoff', () => {
    const skipped = run(interviewState(), {
      type: 'RECORD_ANSWERS',
      answers: [{ gapId: 'offer:services-1:price', answer: 'later', skipped: true }],
    })
    expect(handoffEligible(skipped)).toBe(true)
    expect(run(skipped, { type: 'REQUEST_HANDOFF', at: T0 }).phase).toBe('REVIEW_HANDOFF')
  })

  it('agent handoff is invalid before analysis', () => {
    const ingest = run(createIntakeState(), { type: 'ADD_SOURCE', source: urlSource })
    expectError(ingest, { type: 'REQUEST_HANDOFF', at: T0 }, 'invalid_phase')
  })

  it('EXIT_TO_BUILDER works from every phase with everything captured so far', () => {
    // INGEST
    const fromIngest = run(createIntakeState(), { type: 'EXIT_TO_BUILDER', at: T0 })
    expect(fromIngest.phase).toBe('REVIEW_HANDOFF')
    expect(fromIngest.handoff?.via).toBe('owner_exit')

    // EXTRACT
    const extracted = run(createIntakeState(), { type: 'ADD_SOURCE', source: urlSource }, { type: 'RECORD_EXTRACTION', extraction: extraction() })
    const fromExtract = run(extracted, { type: 'EXIT_TO_BUILDER', at: T0 })
    expect(fromExtract.phase).toBe('REVIEW_HANDOFF')
    expect(fromExtract.draft.name).toBe('Apex Catering Co.') // captured

    // GAP_ANALYSIS
    const analyzed = run(extracted, { type: 'ANALYZE_GAPS' })
    expect(run(analyzed, { type: 'EXIT_TO_BUILDER', at: T0 }).phase).toBe('REVIEW_HANDOFF')

    // INTERVIEW (with a blocking gap still open - exit is still allowed)
    const fromInterview = run(interviewState(), { type: 'EXIT_TO_BUILDER', at: T0 })
    expect(fromInterview.phase).toBe('REVIEW_HANDOFF')

    // SYNTHESIS
    const synthesized = run(interviewState(), {
      type: 'RECORD_ANSWERS',
      answers: [{ gapId: 'offer:services-1:price', answer: '$250', fields: [{ target: 'offer', offerKey: 'services-1', field: 'price', value: '$250' }] }],
    })
    expect(synthesized.phase).toBe('SYNTHESIS')
    const fromSynthesis = run(synthesized, { type: 'EXIT_TO_BUILDER', at: T0 })
    expect(fromSynthesis.phase).toBe('REVIEW_HANDOFF')
    expect(fromSynthesis.draft.services[1].price).toBe('$250')
  })

  it('after handoff, only messages are accepted', () => {
    const done = run(interviewState(), { type: 'EXIT_TO_BUILDER', at: T0 })
    expectError(done, { type: 'ADD_SOURCE', source: { id: 's9', kind: 'url', value: 'https://x', addedAt: T0 } }, 'already_handed_off')
    expectError(done, { type: 'RECORD_ANSWERS', answers: [{ gapId: 'x', answer: 'y' }] }, 'already_handed_off')
    expectError(done, { type: 'REQUEST_HANDOFF', at: T0 }, 'already_handed_off')
    expectError(done, { type: 'EXIT_TO_BUILDER', at: T0 }, 'already_handed_off')
    const after = run(done, { type: 'ADD_MESSAGE', message: { id: 'm-end', role: 'owner', content: 'thanks!', at: T0 } })
    expect(after.messages.map((m) => m.id)).toContain('m-end')
  })
})

describe('interview loop - INTERVIEW ⇄ SYNTHESIS convergence', () => {
  it('ask → answer → re-ask cycles until no blocking gaps remain, then hands off', () => {
    let state = run(
      createIntakeState(),
      { type: 'ADD_SOURCE', source: urlSource },
      { type: 'RECORD_EXTRACTION', extraction: extraction() },
      { type: 'ANALYZE_GAPS' },
    )
    // Answer every blocking gap the machine surfaces, batch by batch (≤3).
    let rounds = 0
    while (state.gaps.some((g) => g.kind === 'blocking')) {
      rounds += 1
      expect(rounds).toBeLessThan(10) // convergence guard
      const batch = state.gaps.filter((g) => g.kind === 'blocking').slice(0, 3)
      state = run(state, { type: 'ASK_GAPS', gapIds: batch.map((g) => g.id) })
      expect(state.phase).toBe('INTERVIEW')
      const answers: GapAnswer[] = batch.map((gap) => ({
        gapId: gap.id,
        answer: 'answered',
        fields: gap.offerKey
          ? [{ target: 'offer', offerKey: gap.offerKey, field: 'price', value: '$100' }]
          : [{ target: 'page', field: gap.field as 'name', value: 'filled' }],
      }))
      state = run(state, { type: 'RECORD_ANSWERS', answers })
      expect(state.phase).toBe('SYNTHESIS')
    }
    expect(handoffEligible(state)).toBe(true)
    const done = run(state, { type: 'REQUEST_HANDOFF', at: T0 })
    expect(done.phase).toBe('REVIEW_HANDOFF')
    expect(done.handoff?.via).toBe('agent')
  })

  it('mid-conversation ingest re-analyzes gaps in place', () => {
    const state = run(interviewState(), { type: 'ADD_SOURCE', source: { id: 'src-3', kind: 'integration', value: 'stripe', addedAt: T0 } })
    const withExtraction = run(state, {
      type: 'RECORD_EXTRACTION',
      extraction: { sourceId: 'src-3', offers: [{ name: 'Stripe Priced Trays', description: '', price: '$275', url: '' }], clarifyingQuestions: [] },
    })
    expect(withExtraction.phase).toBe('INTERVIEW') // no phase regression
    expect(withExtraction.draft.services.map((o) => o.name)).toContain('Stripe Priced Trays')
    // gaps were recomputed against the enriched draft
    expect(withExtraction.gaps.map((g) => g.id)).toContain('offer:services-1:price')
  })
})
