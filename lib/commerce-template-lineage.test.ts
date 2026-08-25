import { describe, expect, it } from 'vitest'
import {
  COMMERCE_TEMPLATE_LINEAGE_SOURCE,
  commerceTemplateLineageFromSources,
  commerceTemplateLineageSummary,
} from './commerce-template-lineage'
import type { IntakeSource } from './intake/types'

const ADOPTED_AT = '2026-08-25T22:30:00.000Z'

function templateSource(value: string, addedAt = ADOPTED_AT): IntakeSource {
  return {
    id: `source-${value}`,
    kind: 'template',
    value,
    addedAt,
  }
}

describe('Commerce Template lineage', () => {
  it('retains the exact registered template and intake timestamp', () => {
    expect(commerceTemplateLineageFromSources([
      templateSource('commerce-template:events.party-rentals@1'),
    ])).toEqual({
      commerce_template_id: 'events.party-rentals',
      commerce_template_version: 1,
      commerce_template_adopted_at: ADOPTED_AT,
      commerce_template_source: COMMERCE_TEMPLATE_LINEAGE_SOURCE,
    })
  })

  it('uses the latest deliberate selection and rejects an unknown latest version', () => {
    expect(commerceTemplateLineageFromSources([
      templateSource('commerce-template:events.party-rentals@1'),
      templateSource('commerce-template:events.party-rentals@999'),
    ])).toBeNull()
  })

  it('does not manufacture lineage from ordinary, malformed, or invalid-time sources', () => {
    expect(commerceTemplateLineageFromSources([{
      id: 'url-source',
      kind: 'url',
      value: 'https://example.com',
      addedAt: ADOPTED_AT,
    }])).toBeNull()
    expect(commerceTemplateLineageFromSources([
      templateSource('commerce-template:events.party-rentals'),
    ])).toBeNull()
    expect(commerceTemplateLineageFromSources([
      templateSource('commerce-template:events.party-rentals@1', 'not-a-date'),
    ])).toBeNull()
  })

  it('resolves current owner context and safely labels an archived reference', () => {
    expect(commerceTemplateLineageSummary({
      commerce_template_id: 'events.party-rentals',
      commerce_template_version: 1,
      commerce_template_adopted_at: ADOPTED_AT,
      commerce_template_source: COMMERCE_TEMPLATE_LINEAGE_SOURCE,
    })).toEqual({
      templateId: 'events.party-rentals',
      templateVersion: 1,
      title: 'Party Rentals',
      adoptedAt: ADOPTED_AT,
      referenceAvailable: true,
    })

    expect(commerceTemplateLineageSummary({
      commerce_template_id: 'events.archived-reference',
      commerce_template_version: 3,
      commerce_template_adopted_at: ADOPTED_AT,
      commerce_template_source: COMMERCE_TEMPLATE_LINEAGE_SOURCE,
    })).toMatchObject({
      title: 'Previous setup guide',
      referenceAvailable: false,
    })
  })

  it('fails closed for incomplete or untrusted page records', () => {
    expect(commerceTemplateLineageSummary({
      commerce_template_id: 'events.party-rentals',
      commerce_template_version: null,
      commerce_template_adopted_at: ADOPTED_AT,
      commerce_template_source: COMMERCE_TEMPLATE_LINEAGE_SOURCE,
    })).toBeNull()
    expect(commerceTemplateLineageSummary({
      commerce_template_id: 'events.party-rentals',
      commerce_template_version: 1,
      commerce_template_adopted_at: ADOPTED_AT,
      commerce_template_source: null,
    })).toBeNull()
  })
})
