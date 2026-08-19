import { describe, expect, it } from 'vitest'
import { sessionState, type IntakeSessionRow } from '../../agents/intake'
import {
  commerceTemplateSourceValue,
  getCommerceTemplateGapCandidates,
  resolveCommerceIntakeTemplateContext,
  selectedCommerceTemplateRef,
} from '../../commerce-templates/intake'
import { analyzeGaps, applyIntakeAction, createIntakeState, pageProvenanceKey, type IntakeState } from '../index'

const DETAILING_REF = { id: 'automotive.mobile-auto-detailing', version: 1 }

const service = {
  name: 'Full Detail',
  description: 'Interior and exterior detailing.',
  price: '$199',
  url: '',
  duration: '2 hours',
}

function addTemplateSource(state: IntakeState, ref = DETAILING_REF): IntakeState {
  const added = applyIntakeAction(state, {
    type: 'ADD_SOURCE',
    source: {
      id: 'template-source',
      kind: 'template',
      value: commerceTemplateSourceValue(ref),
      label: 'Reference template: Mobile Auto Detailing',
      addedAt: '2026-08-19T00:00:00.000Z',
    },
  })
  expect(added.ok).toBe(true)
  return added.ok ? added.state : state
}

describe('owner-selected commerce template sources', () => {
  it('can choose question knowledge before industry is known without writing industry truth', () => {
    const state = addTemplateSource(createIntakeState({ seed: { services: [service] } }))

    const context = resolveCommerceIntakeTemplateContext(state)
    expect(context.matches[0]?.template.id).toBe(DETAILING_REF.id)
    expect(context.candidates.map((candidate) => candidate.factKey)).toEqual(['service-area', 'travel-fee'])

    // Selecting a reference template is context, not a merchant assertion.
    expect(state.draft.industry).toBe('')
    expect(state.provenance[pageProvenanceKey('industry')]).toBeUndefined()
  })

  it('keeps the normal industry question while allowing later non-blocking template questions', () => {
    const state = addTemplateSource(createIntakeState({ seed: { services: [service] } }))
    const gaps = analyzeGaps(state)

    expect(gaps.map((gap) => gap.id)).toContain('page:industry')
    expect(gaps.map((gap) => gap.id)).toContain('tpl:automotive.mobile-auto-detailing:service-area')
    expect(gaps.find((gap) => gap.id === 'tpl:automotive.mobile-auto-detailing:service-area')?.kind).toBe('quality')
  })

  it('lets a conflicting merchant/imported industry override the selected template source', () => {
    const state = addTemplateSource(createIntakeState({
      seed: {
        industry: 'Home Cleaning',
        services: [{ ...service, name: 'Recurring Cleaning' }],
      },
    }))

    const context = resolveCommerceIntakeTemplateContext(state)
    expect(context.matches[0]?.template.id).toBe('home.recurring-home-cleaning')
    expect(context.matches.map((match) => match.template.id)).not.toContain(DETAILING_REF.id)
  })

  it('ignores a stale exact template version rather than silently upgrading it', () => {
    const state = addTemplateSource(createIntakeState({ seed: { services: [service] } }), { ...DETAILING_REF, version: 999 })

    expect(resolveCommerceIntakeTemplateContext(state)).toEqual({ matches: [], candidates: [] })
    expect(getCommerceTemplateGapCandidates(state)).toEqual([])
  })

  it('survives the existing persisted-session rehydration path', () => {
    const original = addTemplateSource(createIntakeState({ seed: { services: [service] } }))
    const row: IntakeSessionRow = {
      id: 'session-1',
      owner_id: 'owner-1',
      page_id: null,
      status: 'active',
      phase: original.phase,
      state: original,
    }

    const restored = sessionState(row)
    expect(selectedCommerceTemplateRef(restored.sources)).toEqual(DETAILING_REF)
    expect(resolveCommerceIntakeTemplateContext(restored).matches[0]?.template.id).toBe(DETAILING_REF.id)
    expect(restored.draft.industry).toBe('')
  })
})
