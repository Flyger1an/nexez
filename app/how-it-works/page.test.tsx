import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HOW_IT_WORKS_COPY, HowItWorksExperience } from '../../components/marketing/HowItWorksExperience'
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
    expect(copy).toContain('buyers can choose')
    expect(copy).toContain('ai assistants')
    expect(copy).toContain('get paid')
    expect(copy).toContain('plain language')
    expect(copy).toContain('stop instead of guessing')
  })

  it('keeps simple setup and the public simulator visible in the merchant journey', () => {
    const markup = renderToStaticMarkup(<HowItWorksExperience />).toLowerCase()

    expect(markup).toContain('no coding required')
    expect(markup).toContain('see how an ai assistant understands your business')
    expect(markup).toContain('try the simulator')
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
