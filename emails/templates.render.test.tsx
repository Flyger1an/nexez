import { render } from '@react-email/render'
import { describe, expect, it } from 'vitest'
import { emailPreviewFixtures } from './fixtures'
import { NEXEZ_EMAIL_ICON_URL } from './theme'

describe('transactional email preview fixtures', () => {
  it.each(emailPreviewFixtures)('$id renders a complete, email-safe document', async (fixture) => {
    const html = await render(fixture.element)
    const visibleHtml = html.replaceAll('<!-- -->', '')
    const normalizedLogoUrl = NEXEZ_EMAIL_ICON_URL.replaceAll('&', '&amp;')

    expect(html).toContain(normalizedLogoUrl)
    expect(html).toContain('alt="Nexez"')
    expect(html).not.toContain('Nexez AI')
    expect(html).toContain(fixture.expectedCta.replaceAll('&', '&amp;'))
    expect(visibleHtml).toContain(fixture.expectedState)
    expect(html).toContain('Reply to this email for support.')
    expect(html).not.toContain('mailto:')
    expect(html).not.toContain('undefined')
    expect(html).not.toContain('[object Object]')
    expect(html).not.toContain('<script')
    expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(102_400)
  })

  it('covers every transactional and account lifecycle family', () => {
    expect(emailPreviewFixtures.map((fixture) => fixture.id)).toEqual(expect.arrayContaining([
      'merchant-booking',
      'merchant-negotiation',
      'merchant-escrow-held',
      'merchant-payment-received',
      'merchant-refund-recorded',
      'merchant-dispute-opened',
      'merchant-dispute-closed',
      'buyer-receipt',
      'buyer-refunded',
      'buyer-partial-refund',
      'buyer-dispute-update',
      'buyer-request-received',
      'merchant-refund-request',
      'merchant-problem-report',
      'buyer-order-lookup',
      'account-team-invite',
      'account-growth-invite',
      'account-promotion-expiry',
      'account-welcome',
      'account-stripe-connected',
      'merchant-stale-listing',
      'support-new-ticket',
      'support-operator-reply',
      'support-requester-reply',
    ]))
  })
})
