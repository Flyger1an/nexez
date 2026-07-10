import { describe, expect, it } from 'vitest'
import { getOnboardingSteps, onboardingProgress } from '../onboarding'
import type { AgentPage } from '../agent-page'

function page(over: Partial<AgentPage>): AgentPage {
  return { id: 'p1', name: 'P', slug: 'p', is_published: false, services: [], products: [], faqs: [], ...over } as AgentPage
}

describe('getOnboardingSteps', () => {
  it('all incomplete with no pages', () => {
    const steps = getOnboardingSteps([])
    expect(steps.map((s) => s.done)).toEqual([false, false, false, false, false])
    expect(steps[0].href).toBe('/create')
  })

  it('marks create/offers/publish/website/domain from page state', () => {
    const steps = getOnboardingSteps([
      page({
        id: 'abc',
        is_published: true,
        services: [{ name: 'svc' }] as never,
        website_verified_at: '2026-07-10T00:00:00Z',
        custom_domain_verified: '2026-06-03T00:00:00Z',
      }),
    ])
    const byId = Object.fromEntries(steps.map((s) => [s.id, s.done]))
    expect(byId).toEqual({ create: true, offers: true, publish: true, website: true, domain: true })
    // editor/settings hrefs point at the first page
    expect(steps.find((s) => s.id === 'offers')?.href).toBe('/dashboard/abc')
    expect(steps.find((s) => s.id === 'domain')?.href).toBe('/dashboard/abc/settings')
    expect(steps.find((s) => s.id === 'website')?.href).toBe('/dashboard/abc/settings')
  })

  it('the website step keys off website_verified_at', () => {
    const notVerified = getOnboardingSteps([page({ id: 'x', is_published: true, services: [{ name: 's' }] as never })])
    expect(notVerified.find((s) => s.id === 'website')?.done).toBe(false)
    const verified = getOnboardingSteps([page({ id: 'x', website_verified_at: '2026-07-10T00:00:00Z' })])
    expect(verified.find((s) => s.id === 'website')?.done).toBe(true)
  })

  it('offers false when no offers, publish false when draft', () => {
    const steps = getOnboardingSteps([page({ id: 'x', is_published: false, services: [], products: [] })])
    const byId = Object.fromEntries(steps.map((s) => [s.id, s.done]))
    expect(byId.create).toBe(true)
    expect(byId.offers).toBe(false)
    expect(byId.publish).toBe(false)
  })

  it('a handed-off intake interview completes the create step (spec §8)', () => {
    const steps = getOnboardingSteps([], { interviewCompleted: true })
    expect(steps.find((s) => s.id === 'create')?.done).toBe(true)
    // the rest still derive from page state
    expect(steps.find((s) => s.id === 'offers')?.done).toBe(false)
  })

  it('the create step advertises the interview path', () => {
    const steps = getOnboardingSteps([])
    expect(steps.find((s) => s.id === 'create')?.description).toMatch(/intake interview/i)
  })
})

describe('onboardingProgress', () => {
  it('computes done/total/percent/complete', () => {
    const steps = getOnboardingSteps([])
    expect(onboardingProgress(steps)).toEqual({ done: 0, total: 5, percent: 0, complete: false })
  })
  it('complete when all done', () => {
    const steps = getOnboardingSteps([
      page({ is_published: true, services: [{ name: 's' }] as never, website_verified_at: 'w', custom_domain_verified: 'x' }),
    ])
    const p = onboardingProgress(steps)
    expect(p.complete).toBe(true)
    expect(p.percent).toBe(100)
  })
})
