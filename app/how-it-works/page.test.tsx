import { describe, expect, it } from 'vitest'
import { HOW_IT_WORKS_COPY } from '../../components/marketing/HowItWorksExperience'
import { marketingUrl } from '../../lib/site'
import { metadata } from './page'

const copy = JSON.stringify(HOW_IT_WORKS_COPY).toLowerCase()

const architectureJargon = [
  'agent.json',
  'artifact',
  'configuration',
  'crawlable',
  'deterministic',
  'manifest',
  'machine-readable',
  'mcp',
  'provenance',
  'schema',
  'structured output',
]

describe('/how-it-works merchant story', () => {
  it('uses plain merchant language instead of architecture jargon', () => {
    for (const term of architectureJargon) {
      expect(copy).not.toContain(term)
    }

    expect(copy).toContain('you set')
    expect(copy).toContain('customers and ai assistants')
    expect(copy).toContain('get paid')
    expect(copy).toContain('no coding required')
  })

  it('keeps the public simulator in the merchant journey', () => {
    expect(copy).toContain('ai assistant understands your business')
  })

  it('exports plain-language metadata for the page', () => {
    expect(metadata.title).toBe('How It Works')
    expect(metadata.description).toMatch(/tell nexez what you sell/i)
    expect(metadata.description).toMatch(/customers and ai assistants/i)
    expect(metadata.alternates?.canonical).toBe(marketingUrl('/how-it-works'))
    expect(metadata.openGraph?.url).toBe(marketingUrl('/how-it-works'))
    expect(metadata.openGraph?.title).toBe(metadata.title)
    expect(metadata.openGraph?.description).toBe(metadata.description)
  })
})
