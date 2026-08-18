import { describe, expect, it } from 'vitest'
import { metadata } from './page'
import { marketingUrl } from '../../lib/site'

describe('/pricing metadata', () => {
  it('exports a page-specific title, description, canonical, and OG card', () => {
    expect(metadata.title).toMatch(/pricing/i)
    // Root layout applies the '%s · Nexez' template - no double-branding here.
    expect(String(metadata.title)).not.toMatch(/nexez/i)
    expect(metadata.description).toMatch(/start free/i)
    expect(metadata.description).toMatch(/agentic checkout/i)
    expect(metadata.description).toMatch(/9%/)
    expect(metadata.description).toMatch(/lower platform fees/i)
    expect(metadata.alternates?.canonical).toBe(marketingUrl('/pricing'))
    expect(metadata.openGraph?.url).toBe(marketingUrl('/pricing'))
    expect(metadata.openGraph?.title).toBe(metadata.title)
    expect(metadata.openGraph?.description).toBe(metadata.description)
  })
})
