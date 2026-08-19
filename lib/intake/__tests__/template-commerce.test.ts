import { describe, expect, it } from 'vitest'
import { getCommerceTemplateGapCandidates } from '../../commerce-templates/intake'
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
  it('adds deterministic Auto Detailing questions without creating blockers', () => {
    const draft = draftWith({
      industry: 'Auto Detailing',
      description: 'Mobile detailing at homes and offices.',
      services: [{ name: 'Full Detail', description: '', price: '$199', url: '', duration: '2 hours' }],
    })
    const candidates = getCommerceTemplateGapCandidates({ draft })
    const factKeys = candidates.map((candidate) => candidate.factKey)
    expect(factKeys).toContain('vehicle-class')
    expect(factKeys).toContain('package')
    expect(factKeys).toContain('service-area')
    expect(candidates).toHaveLength(5)
    expect(candidates.every((candidate) => candidate.gap.kind !== 'blocking')).toBe(true)
    expect(candidates.some((candidate) => candidate.factKey === 'price-logic')).toBe(false)
  })

  it('does not ask service area again when an offer already covers it', () => {
    const draft = draftWith({
      industry: 'Auto Detailing',
      services: [{ name: 'Full Detail', description: '', price: '$199', url: '', duration: '2 hours', serviceArea: 'DFW' }],
    })
    expect(getCommerceTemplateGapCandidates({ draft }).some((candidate) => candidate.factKey === 'service-area')).toBe(false)
  })

  it('requires the canonical pilot industry during the initial rollout', () => {
    const draft = draftWith({ industry: 'Catering', description: 'Private dinners and events.' })
    expect(getCommerceTemplateGapCandidates({ draft })).toEqual([])
  })

  it('lets legacy industry expectations win shared semantic knowledge slots', () => {
    const draft = draftWith({
      industry: 'Photography',
      services: [{ name: 'Event Coverage', description: '', price: '$800', url: '', duration: '4 hours' }],
    })
    const base = [
      baseGap({ id: 'ind:photo-turnaround', field: 'offer.turnaround', priority: 160 }),
      baseGap({ id: 'ind:photo-licensing', field: 'offer.licensing', priority: 161 }),
      baseGap({ id: 'page:faqs', field: 'faqs', priority: 190 }),
    ]
    const merged = mergeCommerceTemplateGaps(base, { draft, answers: [] })
    expect(merged.filter((gap) => gap.field === 'offer.turnaround')).toHaveLength(1)
    expect(merged.filter((gap) => gap.field === 'offer.licensing')).toHaveLength(1)
    expect(merged.map((gap) => gap.id)).toContain('tpl:events.event-photography:deliverables')
    expect(merged.map((gap) => gap.id)).not.toContain('tpl:events.event-photography:licensing')
  })

  it('retires a one-shot template knowledge gap after the merchant answers it', () => {
    const draft = draftWith({
      industry: 'Photography',
      services: [{ name: 'Event Coverage', description: '', price: '$800', url: '', duration: '4 hours' }],
    })
    const base = [baseGap({ id: 'page:faqs', field: 'faqs' })]
    const gapId = 'tpl:events.event-photography:deliverables'
    const merged = mergeCommerceTemplateGaps(base, { draft, answers: [{ gapId, answer: 'Edited online gallery' }] })
    expect(merged.map((gap) => gap.id)).not.toContain(gapId)
  })
})
