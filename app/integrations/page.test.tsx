import { describe, expect, it } from 'vitest'
import { marketingPages } from '../../lib/marketing-content'
import { marketingUrl } from '../../lib/site'
import { metadata } from './page'

describe('/integrations metadata', () => {
  it('describes the shipped scoped connector set', () => {
    expect(metadata.description).toMatch(/connect[^.]*Google Calendar/i)
    expect(metadata.description).toMatch(/WooCommerce/i)
    expect(metadata.description).toMatch(/ServiceM8/i)
    expect(metadata.alternates?.canonical).toBe(marketingUrl('/integrations'))
    expect(metadata.openGraph?.description).toBe(metadata.description)

    const google = marketingPages.integrations.sections
      .flatMap((section) => section.cards)
      .find((card) => card?.title === 'Google Calendar')
    expect(google?.copy).toMatch(/free\/busy status/i)
    expect(google?.copy).not.toMatch(/sample/i)
    expect(google?.copy).toMatch(/without reading event names or descriptions/i)
  })
})
