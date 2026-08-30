import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_WEB_HANDOFFS,
  buildImporterHandoff,
  COMPETITOR_ANALYSIS_WEB_HANDOFF,
} from './web-handoffs'

describe('seller web handoffs', () => {
  it('uses canonical settings anchors for account management', () => {
    expect(ACCOUNT_WEB_HANDOFFS).toEqual({
      apiKeys: '/dashboard/tools',
      customDomains: '/dashboard/settings#agent-surfaces',
      profileSecurity: '/dashboard/settings#security',
      team: '/dashboard/settings#team',
      data: '/dashboard/settings#data',
    })
  })

  it('opens the real signed-in competitor lens instead of implying local market data', () => {
    const handoff = new URL(COMPETITOR_ANALYSIS_WEB_HANDOFF, 'https://app.nexez.ai')

    expect(handoff.pathname).toBe('/login')
    expect(handoff.searchParams.get('next')).toBe('/simulator?mode=compare')
  })

  it('preserves a complete source URL through the create handoff', () => {
    const source = 'https://shop.example.com/services/repair?area=Austin%20%26%20Round%20Rock&urgent=true#book'
    const result = buildImporterHandoff(source)

    expect(result).toMatchObject({ ok: true, sourceUrl: source })
    if (!result.ok) throw new Error('Expected a valid importer handoff')

    const handoff = new URL(result.path, 'https://app.nexez.ai')
    expect(handoff.pathname).toBe('/create')
    expect(handoff.searchParams.get('url')).toBe(source)
  })

  it('normalizes a bare public hostname to HTTPS', () => {
    expect(buildImporterHandoff('  example.com/services  ')).toEqual({
      ok: true,
      sourceUrl: 'https://example.com/services',
      path: '/create?url=https%3A%2F%2Fexample.com%2Fservices',
    })
  })

  it.each([
    ['', 'Enter a website URL.'],
    ['ftp://example.com/catalog', 'Use an HTTP or HTTPS website URL.'],
    ['https://user:secret@example.com', 'Enter a public website URL without sign-in details.'],
    ['https://', 'Enter a valid website URL.'],
  ])('rejects an unsafe or invalid source URL', (value, message) => {
    expect(buildImporterHandoff(value)).toEqual({ ok: false, message })
  })
})
