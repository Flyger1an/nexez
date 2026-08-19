import { describe, expect, it } from 'vitest'
import { commerceBenchmark } from './benchmark'
import { routeCommerceBuyerIntent } from './buyer-router'
import { listCommerceTemplates } from './registry'
import type { CommerceTemplate } from './schema'

describe('routeCommerceBuyerIntent', () => {
  it('routes every current CommerceEval buyer request to its owning template', () => {
    const templates = listCommerceTemplates({ status: 'active' })

    for (const benchmarkCase of commerceBenchmark.cases) {
      const route = routeCommerceBuyerIntent(templates, benchmarkCase.request)
      expect(route.status, benchmarkCase.id).toBe('matched')
      expect(route.matches[0]?.template.id, benchmarkCase.id).toBe(benchmarkCase.expected.templateId)
      expect(route.matches[0]?.template.version, benchmarkCase.id).toBe(benchmarkCase.template.version)
      expect(route.matches[0]?.score, benchmarkCase.id).toBeGreaterThan(0)
      expect(route.matches[0]?.matchedTerms.length, benchmarkCase.id).toBeGreaterThan(0)
    }
  })

  it('routes from buyer-facing template evidence rather than seller matchHints', () => {
    const templates = listCommerceTemplates({ status: 'active' })
    const target = templates.find((template) => template.id === 'automotive.mobile-auto-detailing')
    if (!target) throw new Error('Missing mobile detailing template')

    const mutated: CommerceTemplate = {
      ...target,
      matchHints: {
        industries: ['Unrelated Industry'],
        keywords: ['zzzx seller-only phrase'],
        offerTerms: ['zzzx seller-only offer'],
      },
    }
    const field = templates.map((template) => template.id === target.id ? mutated : template)
    const route = routeCommerceBuyerIntent(field, 'Two SUVs at my office, one with heavy dog hair.')

    expect(route.status).toBe('matched')
    expect(route.matches[0]?.template.id).toBe(target.id)
    expect(route.matches[0]?.reasons.join(' ')).toContain('customer intent')
  })

  it('abstains from generic requests with no commerce-pattern evidence', () => {
    const route = routeCommerceBuyerIntent(
      listCommerceTemplates({ status: 'active' }),
      'I need help next week please.',
    )

    expect(route).toEqual({
      request: 'I need help next week please.',
      status: 'unmatched',
      matches: [],
    })
  })

  it('surfaces ambiguity instead of forcing a tied template choice or hiding it behind result limits', () => {
    const source = listCommerceTemplates({ status: 'active' })
      .find((template) => template.id === 'professional.business-strategy-session')
    if (!source) throw new Error('Missing strategy-session template')

    const first: CommerceTemplate = { ...source, id: 'test.strategy-alpha' }
    const second: CommerceTemplate = { ...source, id: 'test.strategy-beta' }
    const fullRoute = routeCommerceBuyerIntent(
      [first, second],
      'Book a business strategy session.',
    )
    const limitedRoute = routeCommerceBuyerIntent(
      [first, second],
      'Book a business strategy session.',
      { limit: 1 },
    )

    expect(fullRoute.status).toBe('ambiguous')
    expect(fullRoute.matches).toHaveLength(2)
    expect(fullRoute.matches[0].score).toBe(fullRoute.matches[1].score)
    expect(fullRoute.matches.map((match) => match.template.id)).toEqual([
      'test.strategy-alpha',
      'test.strategy-beta',
    ])
    expect(limitedRoute.status).toBe('ambiguous')
    expect(limitedRoute.matches).toHaveLength(1)
    expect(limitedRoute.matches[0].template.id).toBe('test.strategy-alpha')
  })

  it('returns deterministic JSON-safe routing evidence without presenting lexical coverage as probability', () => {
    const route = routeCommerceBuyerIntent(
      listCommerceTemplates({ status: 'active' }),
      'Online calculus tutor for a college freshman.',
    )

    expect(route.status).toBe('matched')
    expect(route.matches[0]?.template.id).toBe('education.private-tutoring')
    expect(route.matches[0]?.coverage).toBeGreaterThan(0)
    expect(route.matches[0]?.coverage).toBeLessThanOrEqual(1)
    expect(() => JSON.stringify(route)).not.toThrow()
    expect(JSON.parse(JSON.stringify(route))).toEqual(route)
  })
})
