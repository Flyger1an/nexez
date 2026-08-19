import { describe, expect, it } from 'vitest'
import {
  getCommerceTemplateGapCandidates,
  resolveCommerceIntakeTemplateContext,
} from '../../commerce-templates/intake'
import { analyzeGaps, createIntakeState, pageProvenanceKey, type IntakeTemplateHint } from '../index'

const DETAILING_HINT: IntakeTemplateHint = {
  id: 'automotive.mobile-auto-detailing',
  version: 1,
  source: 'owner_selected',
}

const service = {
  name: 'Full Detail',
  description: 'Interior and exterior detailing.',
  price: '$199',
  url: '',
  duration: '2 hours',
}

describe('owner-selected commerce template hints', () => {
  it('can choose question knowledge before industry is known without writing industry truth', () => {
    const state = {
      ...createIntakeState({ seed: { services: [service] } }),
      templateHint: DETAILING_HINT,
    }

    const context = resolveCommerceIntakeTemplateContext(state)
    expect(context.matches[0]?.template.id).toBe(DETAILING_HINT.id)
    expect(context.candidates.map((candidate) => candidate.factKey)).toEqual(['service-area', 'travel-fee'])

    // Selecting a reference template is context, not a merchant assertion.
    expect(state.draft.industry).toBe('')
    expect(state.provenance[pageProvenanceKey('industry')]).toBeUndefined()
  })

  it('keeps the normal industry question while allowing later non-blocking template questions', () => {
    const state = {
      ...createIntakeState({ seed: { services: [service] } }),
      templateHint: DETAILING_HINT,
    }
    const gaps = analyzeGaps(state)

    expect(gaps.map((gap) => gap.id)).toContain('page:industry')
    expect(gaps.map((gap) => gap.id)).toContain('tpl:automotive.mobile-auto-detailing:service-area')
    expect(gaps.find((gap) => gap.id === 'tpl:automotive.mobile-auto-detailing:service-area')?.kind).toBe('quality')
  })

  it('lets a conflicting merchant/imported industry override the selected hint', () => {
    const state = {
      ...createIntakeState({
        seed: {
          industry: 'Home Cleaning',
          services: [{ ...service, name: 'Recurring Cleaning' }],
        },
      }),
      templateHint: DETAILING_HINT,
    }

    const context = resolveCommerceIntakeTemplateContext(state)
    expect(context.matches[0]?.template.id).toBe('home.recurring-home-cleaning')
    expect(context.matches.map((match) => match.template.id)).not.toContain(DETAILING_HINT.id)
  })

  it('ignores a stale or unknown exact template version rather than silently upgrading it', () => {
    const state = {
      ...createIntakeState({ seed: { services: [service] } }),
      templateHint: { ...DETAILING_HINT, version: 999 },
    }

    expect(resolveCommerceIntakeTemplateContext(state)).toEqual({ matches: [], candidates: [] })
    expect(getCommerceTemplateGapCandidates(state)).toEqual([])
  })
})
