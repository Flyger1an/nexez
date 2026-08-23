import { describe, expect, it } from 'vitest'
import { resolveCommerceTemplateIntelligence } from '../commerce-templates/intelligence'
import { matchCommerceTemplates } from '../commerce-templates/matcher'
import type { CommerceTemplate } from '../commerce-templates/schema'
import { validateCommerceTemplate } from '../commerce-templates/validate'

const detailing: CommerceTemplate = {
  id: 'automotive.mobile-auto-detailing',
  version: 1,
  status: 'active',
  domain: 'automotive-mobile',
  industry: 'Auto Detailing',
  title: 'Mobile Auto Detailing',
  description: 'Mobile detailing at the customer location.',
  primaryArchetype: 'mobile-service',
  matchHints: {
    industries: ['Auto Detailing', 'Mobile Car Wash'],
    keywords: ['mobile detailing', 'auto detail'],
    offerTerms: ['full detail'],
  },
  customerJobs: ['Get a vehicle detailed without visiting a shop.'],
  customerIntents: [{ id: 'suv', text: 'Detail my SUV at work tomorrow.' }],
  offerBlueprints: [{ key: 'detail', name: 'Mobile Detail', kind: 'service', description: 'On-location detailing.' }],
  requiredFacts: [
    {
      key: 'vehicle-class', label: 'Vehicle class', description: 'Vehicle size affects scope.',
      importance: 'required', scope: 'customer-request', valueType: 'enum',
      ask: 'Which vehicle classes affect your pricing?', why: 'Vehicle size affects scope.',
    },
    {
      key: 'service-area', label: 'Service area', description: 'Mobile service is local.',
      importance: 'required', scope: 'offer', valueType: 'location',
      ask: 'Where do you travel?', why: 'Mobile service is local.',
    },
  ],
  qualityFacts: [
    {
      key: 'condition', label: 'Condition', description: 'Condition can affect scope.',
      importance: 'quality', scope: 'customer-request', valueType: 'string',
      ask: 'Which vehicle conditions affect scope?', why: 'Condition can affect scope.',
    },
  ],
  opportunityFacts: [],
  pricingModes: ['tiered'],
  fulfillmentModes: ['customer-location'],
  schedulingModes: ['fixed-slot'],
  paymentModes: ['full-checkout'],
  capabilityTags: ['MOBILE', 'SERVICE_AREA', 'SCHEDULED', 'CUSTOM_INTAKE'],
  evals: [{
    id: 'automotive.mobile-auto-detailing.direct', difficulty: 'direct', request: 'Detail my SUV.',
    expected: {
      templateId: 'automotive.mobile-auto-detailing',
      requiredFactKeys: ['vehicle-class', 'service-area'],
      capabilityTags: ['MOBILE', 'SERVICE_AREA'],
      mustNot: ['invent merchant pricing'],
    },
  }],
  exampleListing: {
    exampleOnly: true,
    disclaimer: 'Nexez Example - not a real provider.',
    title: 'Mobile Detailing - Nexez Example',
    description: 'Reference example.',
    offers: [{ name: 'Mobile Detail', description: 'Example only.' }],
    tryAsking: ['Detail my SUV at work tomorrow.'],
  },
}

const webDesign: CommerceTemplate = {
  ...detailing,
  id: 'professional.web-design-project',
  domain: 'professional-creative-technical',
  industry: 'Web Design',
  title: 'Web Design Project',
  primaryArchetype: 'complex-project',
  matchHints: { industries: ['Web Design'], keywords: ['website design', 'website redesign'] },
  customerIntents: [{ id: 'site', text: 'Build a five-page website.' }],
  requiredFacts: detailing.requiredFacts.map((fact, index) => index === 0 ? { ...fact, key: 'project-scope', label: 'Project scope' } : fact),
  capabilityTags: ['QUOTE_REQUIRED', 'PROJECT_SCOPE', 'CUSTOM_INTAKE'],
  evals: [{
    id: 'professional.web-design-project.direct', difficulty: 'direct', request: 'Build a website.',
    expected: {
      templateId: 'professional.web-design-project',
      requiredFactKeys: ['project-scope', 'service-area'],
      capabilityTags: ['PROJECT_SCOPE'],
    },
  }],
}

describe('commerce template core', () => {
  it('accepts internally consistent templates', () => {
    expect(validateCommerceTemplate(detailing)).toEqual([])
  })

  it('rejects unsafe public example definitions', () => {
    const unsafe = { ...detailing, exampleListing: { ...detailing.exampleListing!, disclaimer: '' } }
    expect(validateCommerceTemplate(unsafe).map((issue) => issue.path)).toContain('exampleListing.disclaimer')
  })

  it('matches deterministically without mutating merchant state', () => {
    const matches = matchCommerceTemplates([webDesign, detailing], {
      industry: 'Auto Detailing',
      description: 'We provide mobile detailing at homes and offices.',
    })
    expect(matches[0]?.template.id).toBe('automotive.mobile-auto-detailing')
    expect(matches[0]?.score).toBeGreaterThan(matches[1]?.score ?? 0)
  })

  it('returns ranked question intelligence with source refs', () => {
    const result = resolveCommerceTemplateIntelligence([detailing], {
      industry: 'Auto Detailing',
      description: 'Mobile detailing at customer locations.',
    })
    expect(result.matches[0]?.template.id).toBe(detailing.id)
    expect(result.facts[0]?.fact.importance).toBe('required')
    expect(result.facts.map((item) => item.fact.key)).toContain('vehicle-class')
    expect(result.facts.every((item) => item.sources[0]?.ref.id === detailing.id)).toBe(true)
  })

  it('does not force a match for unrelated input', () => {
    expect(matchCommerceTemplates([detailing], { description: 'Quantum hardware laboratory' })).toEqual([])
  })
})
