import { describe, expect, it } from 'vitest'
import type { OfferItem } from '../../agent-page'
import { analyzeGaps, hasBlockingGaps, isVaguePrice } from '../gaps'
import { emptyIntakeDraft } from '../reducer'
import type { GapAnswer, IntakeDraft, IntakeExtraction } from '../types'

// ---------------------------------------------------------------------------
// Fixtures

function draftWith(overrides: Partial<IntakeDraft>): IntakeDraft {
  return { ...emptyIntakeDraft(), ...overrides }
}

function offer(overrides: Partial<OfferItem>): OfferItem {
  return { name: 'Offer', description: 'A thing', price: '$100', url: '', ...overrides }
}

function stateWith(draft: IntakeDraft, extractions: IntakeExtraction[] = [], answers: GapAnswer[] = []) {
  return { draft, extractions, answers }
}

/** A publish-ready core: name/description + one fully-priced offer. */
function readyDraft(overrides: Partial<IntakeDraft> = {}): IntakeDraft {
  return draftWith({
    name: 'Apex Catering Co.',
    description: 'Full-service catering for events.',
    services: [offer({ name: 'Event Catering', price: '$1,200', duration: '4 hours' })],
    ...overrides,
  })
}

const ids = (gaps: ReturnType<typeof analyzeGaps>) => gaps.map((g) => g.id)
const byId = (gaps: ReturnType<typeof analyzeGaps>, id: string) => gaps.find((g) => g.id === id)

// ---------------------------------------------------------------------------

describe('analyzeGaps - blocking vs quality classification', () => {
  it('an empty draft (from scratch) has the publishable minimum as blocking gaps, rubric as quality', () => {
    const gaps = analyzeGaps(stateWith(emptyIntakeDraft()))
    expect(byId(gaps, 'page:name')?.kind).toBe('blocking')
    expect(byId(gaps, 'page:description')?.kind).toBe('blocking')
    expect(byId(gaps, 'page:offers')?.kind).toBe('blocking')
    for (const id of ['page:website_url', 'page:cta_url', 'page:audience', 'page:industry', 'page:location', 'page:contact_email', 'page:faqs']) {
      expect(byId(gaps, id)?.kind).toBe('quality')
    }
    expect(hasBlockingGaps(gaps)).toBe(true)
  })

  it('a scratch interview asks identity first: name, description, then offers', () => {
    const gaps = analyzeGaps(stateWith(emptyIntakeDraft()))
    expect(gaps.slice(0, 3).map((g) => g.id)).toEqual(['page:name', 'page:description', 'page:offers'])
  })

  it('blocking gaps sort before quality, quality before opportunity', () => {
    const gaps = analyzeGaps(stateWith(draftWith({ industry: 'Catering' })))
    const kinds = gaps.map((g) => g.kind)
    const firstQuality = kinds.indexOf('quality')
    const firstOpportunity = kinds.indexOf('opportunity')
    expect(kinds.lastIndexOf('blocking')).toBeLessThan(firstQuality)
    if (firstOpportunity !== -1) {
      expect(kinds.lastIndexOf('quality')).toBeLessThan(firstOpportunity)
    }
  })

  it('a filled field retires its gap', () => {
    const gaps = analyzeGaps(stateWith(readyDraft({ audience: 'Event planners', website_url: 'https://apex.example' })))
    expect(ids(gaps)).not.toContain('page:name')
    expect(ids(gaps)).not.toContain('page:description')
    expect(ids(gaps)).not.toContain('page:offers')
    expect(ids(gaps)).not.toContain('page:audience')
    expect(ids(gaps)).not.toContain('page:website_url')
    expect(hasBlockingGaps(gaps)).toBe(false)
  })

  it('is deterministic - same state, same gaps', () => {
    const state = stateWith(readyDraft({ industry: 'Photography' }))
    expect(analyzeGaps(state)).toEqual(analyzeGaps(state))
  })
})

describe('analyzeGaps - per-offer coverage', () => {
  it('an offer without a price is blocking; a vague price is a quality nudge', () => {
    const draft = readyDraft({
      services: [
        offer({ name: 'Priced', price: '$500' }),
        offer({ name: 'Unpriced', price: '' }),
        offer({ name: 'Vague', price: 'Call for pricing' }),
      ],
    })
    const gaps = analyzeGaps(stateWith(draft))
    expect(byId(gaps, 'offer:services-1:price')?.kind).toBe('blocking')
    expect(byId(gaps, 'offer:services-2:price-vague')?.kind).toBe('quality')
    expect(ids(gaps)).not.toContain('offer:services-0:price')
    expect(hasBlockingGaps(gaps)).toBe(true)
  })

  it('missing duration is quality; untyped commerce posture is opportunity', () => {
    const gaps = analyzeGaps(stateWith(readyDraft({ services: [offer({ name: 'Consult', duration: undefined })] })))
    expect(byId(gaps, 'offer:services-0:duration')?.kind).toBe('quality')
    expect(byId(gaps, 'offer:services-0:posture')?.kind).toBe('opportunity')
  })

  it('a negotiable offer without a floor gets the Smart Rules quality gap; one with pricing rules does not', () => {
    const bare = readyDraft({ services: [offer({ name: 'Neg', offerType: 'negotiable' })] })
    const gapsBare = analyzeGaps(stateWith(bare))
    expect(byId(gapsBare, 'offer:services-0:floor')?.kind).toBe('quality')
    expect(byId(gapsBare, 'offer:services-0:booking-rules')?.kind).toBe('opportunity')

    const ruled = readyDraft({
      services: [offer({ name: 'Neg', offerType: 'negotiable', rules: { minPrice: '$800', minNoticeHours: 24 } })],
    })
    const gapsRuled = analyzeGaps(stateWith(ruled))
    expect(ids(gapsRuled)).not.toContain('offer:services-0:floor')
    expect(ids(gapsRuled)).not.toContain('offer:services-0:booking-rules')
  })

  it('a fixed offer never gets negotiation-rule gaps', () => {
    const gaps = analyzeGaps(stateWith(readyDraft({ services: [offer({ name: 'Fixed', offerType: 'fixed' })] })))
    expect(ids(gaps)).not.toContain('offer:services-0:floor')
    expect(ids(gaps)).not.toContain('offer:services-0:posture')
  })

  it('isVaguePrice recognizes the classic dodges and accepts real anchors', () => {
    for (const vague of ['Custom', 'varies', 'Call for pricing', 'Contact us', 'TBD', 'quote']) {
      expect(isVaguePrice(vague), vague).toBe(true)
    }
    for (const fine of ['$100', 'From $1,200', 'Free', '$95/mo', '']) {
      expect(isVaguePrice(fine), fine).toBe(false)
    }
  })
})

describe('analyzeGaps - importer clarifying questions', () => {
  const extraction = (qs: NonNullable<IntakeExtraction['clarifyingQuestions']>): IntakeExtraction => ({
    sourceId: 'src-1',
    offers: [],
    clarifyingQuestions: qs,
  })

  it('surfaces an importer question while its field is uncovered, with the importer wording winning the dedup slot', () => {
    const gaps = analyzeGaps(
      stateWith(readyDraft(), [
        extraction([{ id: 'q-aud', field: 'audience', question: 'Your site mentions weddings and offices - who is the core buyer?', why: 'Matching' }]),
      ]),
    )
    const importerGap = byId(gaps, 'imp:q-aud')
    expect(importerGap?.kind).toBe('quality')
    expect(importerGap?.question).toContain('weddings and offices')
    // the generic rubric question for the same field must NOT also appear
    expect(ids(gaps)).not.toContain('page:audience')
  })

  it('retires an importer question once its field is covered', () => {
    const gaps = analyzeGaps(
      stateWith(readyDraft({ audience: 'Corporate events' }), [
        extraction([{ id: 'q-aud', field: 'audience', question: 'Who is the buyer?', why: 'Matching' }]),
      ]),
    )
    expect(ids(gaps)).not.toContain('imp:q-aud')
  })

  it('importer offers questions are blocking; pricing questions defer to per-offer coverage', () => {
    const gaps = analyzeGaps(
      stateWith(draftWith({ name: 'A', description: 'B' }), [
        extraction([
          { id: 'q-off', field: 'offers', question: 'What can agents buy?', why: 'Transactability' },
          { id: 'q-price', field: 'pricing', question: 'What are the prices?', why: 'Transactability' },
        ]),
      ]),
    )
    expect(byId(gaps, 'imp:q-off')?.kind).toBe('blocking')
    // the generic offers gap shares the slot and must not double up
    expect(ids(gaps)).not.toContain('page:offers')
    // per-offer coverage owns pricing - the generic importer question is dropped
    expect(ids(gaps)).not.toContain('imp:q-price')
  })
})

describe('analyzeGaps - industry expectations (spec fixtures)', () => {
  it('caterer: minimums + service radius (quality) and dietary options (opportunity)', () => {
    const gaps = analyzeGaps(stateWith(readyDraft({ industry: 'Catering' })))
    expect(byId(gaps, 'ind:catering-minimums')?.kind).toBe('quality')
    expect(byId(gaps, 'ind:catering-radius')?.kind).toBe('quality')
    expect(byId(gaps, 'ind:catering-dietary')?.kind).toBe('opportunity')
  })

  it('caterer with a serviceArea already on an offer is not asked about radius', () => {
    const gaps = analyzeGaps(
      stateWith(readyDraft({ industry: 'Catering', services: [offer({ name: 'Event Catering', serviceArea: 'Austin metro' })] })),
    )
    expect(ids(gaps)).not.toContain('ind:catering-radius')
    expect(ids(gaps)).toContain('ind:catering-minimums')
  })

  it('photographer: turnaround + licensing as quality', () => {
    const gaps = analyzeGaps(stateWith(readyDraft({ industry: 'Photography' })))
    expect(byId(gaps, 'ind:photo-turnaround')?.kind).toBe('quality')
    expect(byId(gaps, 'ind:photo-licensing')?.kind).toBe('quality')
    expect(ids(gaps)).not.toContain('ind:catering-minimums')
  })

  it('plumber: service area + emergency availability (quality), call-out fee (opportunity)', () => {
    const gaps = analyzeGaps(stateWith(readyDraft({ industry: 'Plumbing' })))
    expect(byId(gaps, 'ind:home-service-area')?.kind).toBe('quality')
    expect(byId(gaps, 'ind:home-emergency')?.kind).toBe('quality')
    expect(byId(gaps, 'ind:home-callout')?.kind).toBe('opportunity')
  })

  it('consultant: engagement shape (quality) + timeline (opportunity)', () => {
    const gaps = analyzeGaps(stateWith(readyDraft({ industry: 'Business Consulting' })))
    expect(byId(gaps, 'ind:consulting-engagement')?.kind).toBe('quality')
    expect(byId(gaps, 'ind:consulting-timeline')?.kind).toBe('opportunity')
  })

  it('no industry means no industry expectations', () => {
    const gaps = analyzeGaps(stateWith(readyDraft({ industry: '' })))
    expect(ids(gaps).filter((id) => id.startsWith('ind:'))).toEqual([])
  })
})

describe('analyzeGaps - answered/skipped filtering', () => {
  it('a skipped gap never reappears, even when still uncovered', () => {
    const answers: GapAnswer[] = [{ gapId: 'page:audience', answer: 'skip', skipped: true }]
    const gaps = analyzeGaps(stateWith(readyDraft(), [], answers))
    expect(ids(gaps)).not.toContain('page:audience')
  })

  it('a coverage gap answered without filling the field stays askable (the agent rephrases)', () => {
    const answers: GapAnswer[] = [{ gapId: 'page:audience', answer: 'why do you ask?' }]
    const gaps = analyzeGaps(stateWith(readyDraft(), [], answers))
    expect(ids(gaps)).toContain('page:audience')
  })

  it('one-shot knowledge gaps retire once answered, whatever the answer', () => {
    const answers: GapAnswer[] = [{ gapId: 'ind:catering-dietary', answer: 'we do vegan and gluten-free' }]
    const gaps = analyzeGaps(stateWith(readyDraft({ industry: 'Catering' }), [], answers))
    expect(ids(gaps)).not.toContain('ind:catering-dietary')
  })

  it('skipped blocking gaps are excused from hasBlockingGaps via filtering', () => {
    const draft = draftWith({ name: 'A', description: 'B' }) // no offers → blocking
    const unskipped = analyzeGaps(stateWith(draft))
    expect(hasBlockingGaps(unskipped)).toBe(true)
    const skipped = analyzeGaps(stateWith(draft, [], [{ gapId: 'page:offers', answer: 'later', skipped: true }]))
    expect(hasBlockingGaps(skipped)).toBe(false)
  })
})
