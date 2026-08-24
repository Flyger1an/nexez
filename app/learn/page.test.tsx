import { describe, expect, it } from 'vitest'
import { metadata } from './page'
import { learnArticles } from '../../lib/learn-content'
import { marketingUrl } from '../../lib/site'

describe('/learn metadata', () => {
  it('exports a page-specific title, description, canonical, and OG block', () => {
    expect(metadata.title).toMatch(/learn/i)
    // Root layout applies the '%s · Nexez' template - no double-branding here.
    expect(String(metadata.title)).not.toMatch(/nexez/i)
    expect(String(metadata.title).length + 8).toBeLessThanOrEqual(60)
    expect(String(metadata.description).length).toBeLessThanOrEqual(160)
    expect(metadata.alternates?.canonical).toBe(marketingUrl('/learn'))
    expect(metadata.openGraph?.url).toBe(marketingUrl('/learn'))
    expect(metadata.openGraph?.title).toBe(metadata.title)
    expect(metadata.openGraph?.description).toBe(metadata.description)
    // Page-level openGraph replaces the layout's wholesale, so these must be re-carried.
    expect(metadata.openGraph).toMatchObject({ siteName: 'Nexez' })
  })

  it('has articles to list (an empty hub would render and rank as a dead page)', () => {
    expect(learnArticles.length).toBeGreaterThan(0)
  })
})
