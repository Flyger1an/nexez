import { describe, expect, it } from 'vitest'
import { marketingPages } from '../../lib/marketing-content'
import { marketingUrl } from '../../lib/site'
import { metadata } from './page'

describe('/integrations metadata', () => {
  it('describes Google Calendar as sample availability rather than a shipped connection', () => {
    expect(metadata.description).toMatch(/Google Calendar availability samples/i)
    expect(metadata.description).not.toMatch(/connect[^.]*Google Calendar/i)
    expect(metadata.alternates?.canonical).toBe(marketingUrl('/integrations'))
    expect(metadata.openGraph?.description).toBe(metadata.description)

    const google = marketingPages.integrations.sections
      .flatMap((section) => section.cards)
      .find((card) => card?.title === 'Google Calendar')
    expect(google?.copy).toMatch(/sample availability/i)
    expect(google?.copy).toMatch(/without reading or syncing/i)
  })
})
