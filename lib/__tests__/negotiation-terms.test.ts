import { describe, expect, it } from 'vitest'
import {
  normalizeNegotiationTerms,
  scopePhraseMatches,
  splitMerchantScope,
} from '../negotiation-terms'

describe('normalizeNegotiationTerms', () => {
  it('normalizes the documented flat term vocabulary', () => {
    expect(normalizeNegotiationTerms({
      scope: 'Logo design, brand guide',
      deliverables: ['Source files', 'Usage guide'],
      revisionCount: '2',
      projectWeeks: 6,
    })).toEqual({
      scope: ['Logo design', 'brand guide', 'Source files', 'Usage guide'],
      revisionCount: { state: 'valid', value: 2 },
      projectWeeks: { state: 'valid', value: 6 },
    })
  })

  it('supports the existing nested scope shape and aliases', () => {
    expect(normalizeNegotiationTerms({
      scope: { included: 'Logo design', maxRevisions: 3, maxProjectWeeks: '4' },
    })).toEqual({
      scope: ['Logo design'],
      revisionCount: { state: 'valid', value: 3 },
      projectWeeks: { state: 'valid', value: 4 },
    })
  })

  it('marks conflicting, fractional, negative, and oversized numeric terms invalid', () => {
    expect(normalizeNegotiationTerms({ revisions: 2, revisionCount: 3 }).revisionCount.state).toBe('invalid')
    expect(normalizeNegotiationTerms({ revisions: 1.5 }).revisionCount.state).toBe('invalid')
    expect(normalizeNegotiationTerms({ revisions: -1 }).revisionCount.state).toBe('invalid')
    expect(normalizeNegotiationTerms({ projectWeeks: 1_001 }).projectWeeks.state).toBe('invalid')
  })

  it('does not infer typed authority from arbitrary free-form constraints', () => {
    expect(normalizeNegotiationTerms({ constraints: 'three revisions within six weeks' })).toEqual({
      scope: [],
      revisionCount: { state: 'absent', value: null },
      projectWeeks: { state: 'absent', value: null },
    })
  })
})

describe('scope phrase matching', () => {
  it('matches normalized bounded phrases without broad token scoring', () => {
    expect(scopePhraseMatches('Website design and copywriting', 'Copywriting')).toBe(true)
    expect(scopePhraseMatches('Logo design', 'logo-design')).toBe(true)
    expect(scopePhraseMatches('Paid media strategy', 'media training')).toBe(false)
  })

  it('splits only explicit merchant delimiters', () => {
    expect(splitMerchantScope('Logo design, Brand guide; Source files')).toEqual([
      'Logo design',
      'Brand guide',
      'Source files',
    ])
  })
})
