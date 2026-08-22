import { describe, expect, it } from 'vitest'
import {
  PLATFORM_DOCS_REVIEWED_AT,
  platformCapabilityCount,
  platformDocsChapters,
  platformTrustDestinations,
} from './platform-docs'

describe('platform documentation source of truth', () => {
  it('keeps a complete, uniquely addressable chapter index', () => {
    expect(platformDocsChapters).toHaveLength(10)
    expect(new Set(platformDocsChapters.map((chapter) => chapter.id)).size).toBe(platformDocsChapters.length)
    expect(new Set(platformDocsChapters.map((chapter) => chapter.number)).size).toBe(platformDocsChapters.length)
    expect(platformCapabilityCount()).toBeGreaterThanOrEqual(30)
  })

  it('documents every capability with evidence and a product surface', () => {
    for (const chapter of platformDocsChapters) {
      expect(chapter.promise.length).toBeGreaterThan(40)
      expect(chapter.capabilities.length).toBeGreaterThan(0)
      for (const capability of chapter.capabilities) {
        expect(capability.summary.length).toBeGreaterThan(40)
        expect(capability.details.length).toBeGreaterThanOrEqual(3)
        expect(capability.surfaces.length).toBeGreaterThan(0)
      }
    }
  })

  it('indexes exactly the refreshed Trust destinations without legal pages', () => {
    expect(platformTrustDestinations.map((destination) => destination.href)).toEqual([
      '/agent-readiness',
      '/agents',
      '/integrations',
      '/developers',
      '/developers/buyer-approval',
      '/security',
      '/compare',
      '/enterprise',
    ])
    expect(platformTrustDestinations.some((destination) => /privacy|terms/.test(destination.href))).toBe(false)
  })

  it('uses the official Nexxi buyer-agent name in published documentation', () => {
    expect(JSON.stringify(platformDocsChapters)).not.toContain('Nexie')
    expect(JSON.stringify(platformDocsChapters)).toContain('Nexxi')
    expect(Date.parse(`${PLATFORM_DOCS_REVIEWED_AT}T00:00:00Z`)).not.toBeNaN()
  })
})
