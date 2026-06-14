import { describe, expect, it } from 'vitest'
import {
  countVersionOffers,
  deploymentChangeAt,
  describeDeploymentChange,
  summarizeDeployments,
  type PageVersion,
} from '../deployments'

const mkOffer = (name: string): any => ({ name })

function version(over: Partial<PageVersion>): PageVersion {
  return {
    timestamp: '2026-06-03T00:00:00.000Z',
    name: 'Page',
    description: '',
    services: [],
    products: [],
    faqs: [],
    prefer_original_site: false,
    ...over,
  }
}

describe('countVersionOffers', () => {
  it('sums services + products', () => {
    expect(countVersionOffers(version({ services: [mkOffer('a'), mkOffer('b')], products: [mkOffer('c')] }))).toBe(3)
    expect(countVersionOffers(version({ services: null, products: null }))).toBe(0)
  })
})

describe('summarizeDeployments', () => {
  it('marks index 0 as current and counts offers', () => {
    const versions = [
      version({ name: 'v2', timestamp: '2026-06-03T02:00:00Z', services: [mkOffer('a')] }),
      version({ name: 'v1', timestamp: '2026-06-03T01:00:00Z' }),
    ]
    const out = summarizeDeployments(versions)
    expect(out).toHaveLength(2)
    expect(out[0].isCurrent).toBe(true)
    expect(out[0].offerCount).toBe(1)
    expect(out[1].isCurrent).toBe(false)
  })

  it('handles empty/missing', () => {
    expect(summarizeDeployments([])).toEqual([])
    expect(summarizeDeployments(null)).toEqual([])
  })
})

describe('describeDeploymentChange', () => {
  it('labels the initial deployment', () => {
    expect(describeDeploymentChange(version({}), null)).toBe('Initial saved deployment')
  })

  it('summarizes offer/faq/name/prefer/description changes', () => {
    const prev = version({ name: 'Old', services: [mkOffer('a')], faqs: [], prefer_original_site: false })
    const curr = version({
      name: 'New',
      services: [mkOffer('a'), mkOffer('b')],
      faqs: [{ question: 'q', answer: 'a' }],
      prefer_original_site: true,
      description: 'changed',
    })
    const label = describeDeploymentChange(curr, prev)
    expect(label).toContain('+1 offer')
    expect(label).toContain('+1 FAQ')
    expect(label).toContain('name changed')
    expect(label).toContain('prefer-original on')
    expect(label).toContain('description edited')
  })

  it('reports no structural change when identical', () => {
    expect(describeDeploymentChange(version({}), version({}))).toBe('No structural change')
  })
})

describe('deploymentChangeAt', () => {
  it('diffs index against the next-older version', () => {
    const versions = [
      version({ name: 'v2', services: [mkOffer('a'), mkOffer('b')] }),
      version({ name: 'v1', services: [mkOffer('a')] }),
    ]
    expect(deploymentChangeAt(versions, 0)).toContain('+1 offer')
    expect(deploymentChangeAt(versions, 1)).toBe('Initial saved deployment')
  })
})
