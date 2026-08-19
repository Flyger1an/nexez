import { describe, expect, it } from 'vitest'
import { getCommerceTemplateGapCandidates } from '../../commerce-templates/intake'
import { applyIntakeAction, createIntakeState } from '../index'
import { mergeCommerceTemplateGaps } from '../commerce'
import type { Gap, IntakeDraft } from '../types'

function draftWith(overrides: Partial<IntakeDraft> = {}): IntakeDraft {
  return {
    name: 'Pilot Merchant',
    description: 'Merchant description',
    website_url: '',
    cta_url: '',
    cta_label: '',
    audience: '',
    location: '',
    contact_email: '',
    industry: '',
    services: [],
    products: [],
    faqs: [],
    ...overrides,
  }
}

function baseGap(overrides: Partial<Gap>): Gap {
  return {
    id: 'page:faqs',
    field: 'faqs',
    question: 'FAQ?',
    why: 'FAQ',
    kind: 'quality',
    priority: 190,
    ...overrides,
  }
}

describe('commerce template intake adapter', () => {
  it('surfaces only facts the current intake grammar can persist without semantic side effects', () => {
    const draft = draftWith({
      industry: 'Auto Detailing',
      description: 'Mobile detailing at homes and offices.',
      services: [{ name: 'Full Detail', description: '', price: '$199', url: '', duration: '2 hours' }],
    })
    const candidates = getCommerceTemplateGapCandidates({ draft })
    const factKeys = candidates.map((candidate) => candidate.factKey)

    expect(factKeys).toEqual(['service-area', 'travel-fee'])
    expect(candidates.every((candidate) => candidate.gap.kind !== 'blocking')).toBe(true)
    expect(candidates.every((candidate) => candidate.oneShot === false)).toBe(true)

    // These remain valuable template/eval facts, but asking them today would
    // collect answers the current OfferItem/intake grammar cannot store safely.
    expect(factKeys).not.toContain('vehicle-class')
    expect(factKeys).not.toContain('package')
    expect(factKeys).not.toContain('condition-modifiers')
    expect(factKeys).not.toContain('site-requirements')
    expect(factKeys).not.toContain('price-logic')
  })

  it('does not ask service area again when an offer already covers it', () => {
    const draft = draftWith({
      industry: 'Auto Detailing',
      services: [{ name: 'Full Detail', description: '', price: '$199', url: '', duration: '2 hours', serviceArea: 'DFW' }],
    })
    expect(getCommerceTemplateGapCandidates({ draft }).map((candidate) => candidate.factKey)).toEqual(['travel-fee'])
  })

  it('requires the canonical pilot industry during the initial rollout', () => {
    const draft = draftWith({ industry: 'Catering', description: 'Private dinners and events.' })
    expect(getCommerceTemplateGapCandidates({ draft })).toEqual([])
  })

  it('lets legacy industry expectations win shared semantic slots without repurposing negotiation rules', () => {
    const draft = draftWith({
      industry: 'Home Cleaning',
      services: [{ name: 'Recurring Cleaning', description: '', price: '$160', url: '', duration: '2 hours' }],
    })
    const base = [
      baseGap({ id: 'ind:home-service-area', field: 'offer.serviceArea', priority: 160 }),
      baseGap({ id: 'page:faqs', field: 'faqs', priority: 190 }),
    ]
    const mergedIds = mergeCommerceTemplateGaps(base, { draft, answers: [] }).map((gap) => gap.id)

    expect(mergedIds).toContain('ind:home-service-area')
    expect(mergedIds).not.toContain('tpl:home.recurring-home-cleaning:service-area')
    // minNoticeHours currently lives in offer_rules, whose reducer semantics
    // imply negotiable posture on untyped offers. Do not use that destination
    // for generic template intelligence until rules/posture are decoupled.
    expect(mergedIds).not.toContain('tpl:home.recurring-home-cleaning:notice-policy')
  })

  it('keeps a template coverage gap askable until its structured destination is actually filled', () => {
    const gapId = 'tpl:automotive.mobile-auto-detailing:service-area'
    const draft = draftWith({
      industry: 'Auto Detailing',
      services: [{ name: 'Full Detail', description: '', price: '$199', url: '', duration: '2 hours' }],
    })

    const answeredWithoutUpdate = mergeCommerceTemplateGaps([], {
      draft,
      answers: [{ gapId, answer: 'We cover most of DFW.' }],
    })
    expect(answeredWithoutUpdate.map((gap) => gap.id)).toContain(gapId)

    const coveredDraft = draftWith({
      ...draft,
      services: [{ ...draft.services[0], serviceArea: 'Dallas-Fort Worth' }],
    })
    expect(mergeCommerceTemplateGaps([], { draft: coveredDraft, answers: [] }).map((gap) => gap.id)).not.toContain(gapId)
  })

  it('materializes a template answer through the real reducer facade and retires the gap', () => {
    const gapId = 'tpl:automotive.mobile-auto-detailing:service-area'
    let state = createIntakeState()

    for (const action of [
      {
        type: 'ADD_SOURCE' as const,
        source: { id: 'src-1', kind: 'none' as const, value: '', addedAt: '2026-08-18T00:00:00Z' },
      },
      {
        type: 'RECORD_EXTRACTION' as const,
        extraction: {
          sourceId: 'src-1',
          title: 'DFW Detail Co.',
          description: 'Mobile auto detailing.',
          industry: 'Auto Detailing',
          offers: [{ name: 'Full Detail', description: 'Complete detail', price: '$199', url: '', duration: '2 hours' }],
        },
      },
      { type: 'ANALYZE_GAPS' as const },
    ]) {
      const applied = applyIntakeAction(state, action)
      expect(applied.ok).toBe(true)
      if (applied.ok) state = applied.state
    }

    expect(state.gaps.map((gap) => gap.id)).toContain(gapId)

    let applied = applyIntakeAction(state, { type: 'ASK_GAPS', gapIds: [gapId] })
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    state = applied.state

    applied = applyIntakeAction(state, {
      type: 'RECORD_ANSWERS',
      answers: [{
        gapId,
        answer: 'We serve Dallas-Fort Worth.',
        fields: [{ target: 'offer', offerKey: 'services-0', field: 'serviceArea', value: 'Dallas-Fort Worth' }],
      }],
    })
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    state = applied.state

    expect(state.draft.services[0]?.serviceArea).toBe('Dallas-Fort Worth')
    expect(state.draft.services[0]?.offerType).toBeUndefined()
    expect(state.gaps.map((gap) => gap.id)).not.toContain(gapId)
  })

  it('does not surface unsupported photography facts merely because the template knows them', () => {
    const draft = draftWith({
      industry: 'Photography',
      services: [{ name: 'Event Coverage', description: '', price: '$800', url: '', duration: '4 hours' }],
    })
    const factKeys = getCommerceTemplateGapCandidates({ draft }).map((candidate) => candidate.factKey)
    expect(factKeys).toEqual(['service-area', 'travel-fee'])
    expect(factKeys).not.toContain('deliverables')
    expect(factKeys).not.toContain('licensing')
    expect(factKeys).not.toContain('add-ons')
  })
})
