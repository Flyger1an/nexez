import { describe, expect, it } from 'vitest'
import { metadata } from './page'
import { marketingUrl } from '../../lib/site'

describe('/simulator metadata', () => {
  it('exports a page-specific title, description, canonical, and OG card', () => {
    expect(metadata.title).toMatch(/simulator/i)
    // Root layout applies the '%s · Nexez' template - no double-branding here.
    expect(String(metadata.title)).not.toMatch(/nexez/i)
    expect(metadata.description).toMatch(/simulate/i)
    expect(metadata.alternates?.canonical).toBe(marketingUrl('/simulator'))
    expect(metadata.openGraph?.url).toBe(marketingUrl('/simulator'))
    expect(metadata.openGraph?.title).toBe(metadata.title)
    expect(metadata.openGraph?.description).toBe(metadata.description)
  })
})
