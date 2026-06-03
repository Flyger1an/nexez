import { describe, expect, it } from 'vitest'
import { applyDraftOverlay, draftToLiveUpdate, hasPendingDraft, type PageDraft } from '../draft'

describe('hasPendingDraft', () => {
  it('true only for a non-empty draft object', () => {
    expect(hasPendingDraft({ draft: { name: 'x' } })).toBe(true)
    expect(hasPendingDraft({ draft: {} })).toBe(false)
    expect(hasPendingDraft({ draft: null })).toBe(false)
    expect(hasPendingDraft({})).toBe(false)
    expect(hasPendingDraft(null)).toBe(false)
    expect(hasPendingDraft({ draft: [] as unknown })).toBe(false) // arrays don't count
  })
})

describe('applyDraftOverlay', () => {
  const live = {
    name: 'Live Name',
    description: 'live desc',
    services: [{ name: 'a' }],
    products: [],
    faqs: [],
    industry: 'plumbing',
    prefer_original_site: false,
    slug: 'acme',
  } as Record<string, unknown>

  it('overlays only provided draft fields, preserving the rest', () => {
    const draft: PageDraft = { name: 'Draft Name', services: [{ name: 'b' }, { name: 'c' }] as never }
    const out = applyDraftOverlay(live, draft)
    expect(out.name).toBe('Draft Name')
    expect((out.services as unknown[]).length).toBe(2)
    expect(out.description).toBe('live desc') // untouched
    expect(out.slug).toBe('acme') // non-content field preserved
  })

  it('returns the page unchanged when no draft', () => {
    expect(applyDraftOverlay(live, null)).toBe(live)
  })
})

describe('draftToLiveUpdate', () => {
  it('maps a draft to a complete live-column update with safe defaults', () => {
    expect(draftToLiveUpdate({ name: 'X' })).toEqual({
      name: 'X',
      description: null,
      services: [],
      products: [],
      faqs: [],
      industry: null,
      prefer_original_site: false,
    })
  })

  it('passes through provided values', () => {
    const draft: PageDraft = {
      name: 'Y',
      description: 'd',
      services: [{ name: 's' }] as never,
      products: [{ name: 'p' }] as never,
      faqs: [{ question: 'q', answer: 'a' }],
      industry: 'massage',
      prefer_original_site: true,
    }
    const out = draftToLiveUpdate(draft)
    expect(out.industry).toBe('massage')
    expect(out.prefer_original_site).toBe(true)
    expect((out.services as unknown[]).length).toBe(1)
  })
})
