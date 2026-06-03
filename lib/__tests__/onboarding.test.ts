import { describe, expect, it } from 'vitest'
import { getOnboardingSteps, onboardingProgress } from '../onboarding'
import type { AgentPage } from '../agent-page'

function page(over: Partial<AgentPage>): AgentPage {
  return { id: 'p1', name: 'P', slug: 'p', is_published: false, services: [], products: [], faqs: [], ...over } as AgentPage
}

describe('getOnboardingSteps', () => {
  it('all incomplete with no pages', () => {
    const steps = getOnboardingSteps([])
    expect(steps.map((s) => s.done)).toEqual([false, false, false, false])
    expect(steps[0].href).toBe('/create')
  })

  it('marks create/offers/publish/domain from page state', () => {
    const steps = getOnboardingSteps([
      page({
        id: 'abc',
        is_published: true,
        services: [{ name: 'svc' }] as never,
        custom_domain_verified: '2026-06-03T00:00:00Z',
      }),
    ])
    const byId = Object.fromEntries(steps.map((s) => [s.id, s.done]))
    expect(byId).toEqual({ create: true, offers: true, publish: true, domain: true })
    // editor/settings hrefs point at the first page
    expect(steps.find((s) => s.id === 'offers')?.href).toBe('/dashboard/abc')
    expect(steps.find((s) => s.id === 'domain')?.href).toBe('/dashboard/abc/settings')
  })

  it('offers false when no offers, publish false when draft', () => {
    const steps = getOnboardingSteps([page({ id: 'x', is_published: false, services: [], products: [] })])
    const byId = Object.fromEntries(steps.map((s) => [s.id, s.done]))
    expect(byId.create).toBe(true)
    expect(byId.offers).toBe(false)
    expect(byId.publish).toBe(false)
  })
})

describe('onboardingProgress', () => {
  it('computes done/total/percent/complete', () => {
    const steps = getOnboardingSteps([])
    expect(onboardingProgress(steps)).toEqual({ done: 0, total: 4, percent: 0, complete: false })
  })
  it('complete when all done', () => {
    const steps = getOnboardingSteps([
      page({ is_published: true, services: [{ name: 's' }] as never, custom_domain_verified: 'x' }),
    ])
    const p = onboardingProgress(steps)
    expect(p.complete).toBe(true)
    expect(p.percent).toBe(100)
  })
})
