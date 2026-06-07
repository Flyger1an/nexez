import { describe, expect, it } from 'vitest'
import {
  NEXEZ_INDUSTRIES,
  getIndustryBoostKeywords,
  getIndustrySuggestions,
  industrySeeds,
} from '../industry-catalog'

describe('industry catalog', () => {
  it('keeps a broad shared autocomplete bank without duplicate suggestions', () => {
    expect(NEXEZ_INDUSTRIES.length).toBeGreaterThanOrEqual(120)
    expect(new Set(NEXEZ_INDUSTRIES).size).toBe(NEXEZ_INDUSTRIES.length)
    expect(NEXEZ_INDUSTRIES).toEqual(expect.arrayContaining([
      'AI Automation',
      'Immigration Law',
      'Mobile IV Therapy',
      'Pressure Washing',
      'Virtual Assistant',
    ]))
  })

  it('shares relevant suggestions between builder templates and importer seeds', () => {
    const builderSuggestions = getIndustrySuggestions('Home Services', 'https://example.com')
    const importerSeeds = industrySeeds('Home Services', 'https://example.com')

    expect(builderSuggestions[0].name).toBe('Standard Service Call')
    expect(importerSeeds[0]).toMatchObject({
      name: 'Standard Service Call',
      url: 'https://example.com',
      isMobile: true,
    })
  })

  it('gives importer heuristics industry-specific boost keywords', () => {
    expect(getIndustryBoostKeywords('Retail & E-commerce')).toEqual(expect.arrayContaining(['product', 'shipping', 'inventory']))
    expect(getIndustryBoostKeywords('AI Automation & Operations')).toEqual(expect.arrayContaining(['automation', 'workflow', 'integration']))
  })

  it('maps freeform niches to useful profile templates', () => {
    expect(getIndustrySuggestions('Mobile IV Therapy')[0].name).toBe('Initial Consultation')
    expect(getIndustrySuggestions('Immigration Law')[0].name).toBe('Document Review')
    expect(getIndustrySuggestions('Pressure Washing')[0].name).toBe('Standard Service Call')
  })
})
