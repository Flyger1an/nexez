import { describe, expect, it } from 'vitest'
import {
  commerceTemplates,
  getCommerceTemplate,
  getLatestCommerceTemplate,
  matchCommerceTemplates,
  resolveCommerceTemplateIntelligence,
  validateCommerceTemplate,
} from '../commerce-templates'

describe('commerce template registry', () => {
  it('contains the seven pilots plus the first post-pilot template with unique versioned ids', () => {
    expect(commerceTemplates).toHaveLength(8)
    expect(new Set(commerceTemplates.map((template) => `${template.id}@${template.version}`)).size).toBe(8)
    for (const template of commerceTemplates) {
      expect(validateCommerceTemplate(template)).toEqual([])
      expect(template.exampleListing?.exampleOnly).toBe(true)
      expect(template.exampleListing?.disclaimer.toLowerCase()).toContain('not a real provider')
    }
  })

  it('resolves exact versions and latest versions', () => {
    const template = commerceTemplates[0]
    expect(getCommerceTemplate({ id: template.id, version: template.version })).toBe(template)
    expect(getLatestCommerceTemplate(template.id)).toBe(template)
  })
})

describe('commerce template matcher', () => {
  it('matches mobile auto detailing from merchant facts without writing merchant truth', () => {
    const matches = matchCommerceTemplates(commerceTemplates, {
      industry: 'Auto Detailing',
      description: 'Mobile detailing at homes and offices.',
      offerNames: ['Full Detail', 'Interior Detail'],
    })
    expect(matches[0]?.template.id).toBe('automotive.mobile-auto-detailing')
    expect(matches[0]?.score).toBeGreaterThanOrEqual(100)
  })

  it('supports multi-template matches instead of forcing one merchant identity', () => {
    const matches = matchCommerceTemplates(commerceTemplates, {
      description: 'We help businesses with strategy and websites.',
      offerNames: ['Strategy Session', 'Website Redesign'],
    }, { limit: 3 })
    expect(matches.map((match) => match.template.id)).toContain('professional.business-strategy-session')
    expect(matches.map((match) => match.template.id)).toContain('professional.web-design-project')
  })

  it('does not manufacture a match for unrelated input', () => {
    expect(matchCommerceTemplates(commerceTemplates, { description: 'Completely unrelated orbital mechanics service.' })).toEqual([])
  })
})

describe('commerce template intelligence', () => {
  it('resolves question candidates while preserving template source refs', () => {
    const intelligence = resolveCommerceTemplateIntelligence(commerceTemplates, {
      industry: 'Auto Detailing',
      description: 'Mobile detailing at customer locations.',
    })
    expect(intelligence.matches[0]?.template.id).toBe('automotive.mobile-auto-detailing')
    expect(intelligence.facts[0]?.fact.importance).toBe('required')
    expect(intelligence.facts.map((item) => item.fact.key)).toContain('vehicle-class')
    expect(intelligence.facts.every((item) => item.sources.length > 0)).toBe(true)
  })
})
