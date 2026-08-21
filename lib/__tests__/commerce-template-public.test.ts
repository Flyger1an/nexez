import { describe, expect, it } from 'vitest'
import {
  commerceExamplePath,
  getPublicCommerceExample,
  getPublicCommerceExamples,
} from '../commerce-templates/public'

describe('public commerce template projection', () => {
  it('projects all active examples without live-supply fields', () => {
    const examples = getPublicCommerceExamples()
    expect(examples).toHaveLength(8)
    expect(new Set(examples.map((example) => example.id)).size).toBe(8)

    for (const example of examples) {
      expect(example.disclaimer.toLowerCase()).toContain('not a real provider')
      expect(example.tryAsking.length).toBeGreaterThan(0)
      expect(example.clarifications.length).toBeGreaterThan(0)
      expect(example.capabilityTags.length).toBeGreaterThan(0)

      const keys = new Set<string>()
      const visit = (value: unknown) => {
        if (!value || typeof value !== 'object') return
        if (Array.isArray(value)) {
          value.forEach(visit)
          return
        }
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
          keys.add(key)
          visit(child)
        }
      }
      visit(example)
      expect(keys).not.toContain('owner_id')
      expect(keys).not.toContain('marketplace_discoverable')
      expect(keys).not.toContain('availability')
      expect(keys).not.toContain('minPrice')
      expect(keys).not.toContain('autoAccept')
    }
  })

  it('resolves a stable example by semantic template id', () => {
    const example = getPublicCommerceExample('automotive.mobile-auto-detailing')
    expect(example?.industry).toBe('Auto Detailing')
    expect(example?.title).toContain('Mobile Auto Detailing')
  })

  it('does not manufacture examples for unknown ids', () => {
    expect(getPublicCommerceExample('missing.template')).toBeNull()
  })

  it('builds a stable public reference route', () => {
    expect(commerceExamplePath('automotive.mobile-auto-detailing')).toBe('/examples/automotive.mobile-auto-detailing')
  })
})
