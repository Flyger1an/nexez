import { render } from '@react-email/render'
import { describe, expect, it } from 'vitest'
import { emailPreviewFixtures } from './fixtures'
import { WelcomeEmail } from './templates'
import { NEXEZ_EMAIL_LOGO_URL } from './theme'

describe('transactional email preview fixtures', () => {
  it.each(emailPreviewFixtures)('$id renders a complete, email-safe document', async (fixture) => {
    const html = await render(fixture.element)
    const visibleHtml = html.replaceAll('<!-- -->', '')
    const normalizedLogoUrl = NEXEZ_EMAIL_LOGO_URL.replaceAll('&', '&amp;')

    expect(html).toContain(normalizedLogoUrl)
    expect(html).toContain('alt="Nexez"')
    expect(html).not.toContain('Nexez AI')
    expect(html).toContain(fixture.expectedCta.replaceAll('&', '&amp;'))
    // A badge is only ever the state its object moved into. Where a template
    // declares no state, the assertion is that nothing badge-shaped renders,
    // which is what keeps the badge from returning as decoration.
    // Matched on the attribute, not the bare name: the dark-mode stylesheet
    // defines .nx-badge-* in every document, badge or no badge.
    if (fixture.expectedState === null) {
      expect(html).not.toContain('class="nx-badge-')
      expect(fixture.expectedCopy).toBeTruthy()
    } else {
      expect(html).toContain('class="nx-badge-')
      expect(visibleHtml).toContain(fixture.expectedState)
    }
    if (fixture.expectedCopy) expect(visibleHtml).toContain(fixture.expectedCopy)
    expect(html).toContain('Reply to this email for support.')
    expect(html).toContain('class="nx-masthead"')
    expect(html).not.toContain('nx-masthead-label')
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
      'campaign-founding-cohort',
    ]))
  })

  // The welcome greeting is the only place a raw profile field reaches the reader.
  // Whatever the identity provider put in full_name, only the first token ships:
  // a competitor's welcome mail reached us addressing our company as a person,
  // which is what that merge field does when nobody trims it.
  describe('welcome greeting', () => {
    const urls = {
      createUrl: 'https://app.nexez.ai/create',
      financeUrl: 'https://app.nexez.ai/dashboard/finance',
      docsUrl: 'https://app.nexez.ai/docs',
    }

    it.each([
      ['Taio Okonkwo', 'Welcome, Taio.'],
      ['  Taio   Okonkwo ', 'Welcome, Taio.'],
      ['Taio', 'Welcome, Taio.'],
    ])('renders %j as %j', async (name, expected) => {
      const html = (await render(<WelcomeEmail name={name} {...urls} />)).replaceAll('<!-- -->', '')
      expect(html).toContain(expected)
    })

    it.each([null, undefined, '', '   '])('falls back to the unnamed greeting for %j', async (name) => {
      const html = (await render(<WelcomeEmail name={name} {...urls} />)).replaceAll('<!-- -->', '')
      expect(html).toContain('Welcome to Nexez.')
      expect(html).not.toContain('Welcome, ')
    })

    it('starts with a decisive first step and keeps infrastructure terms out of the message', async () => {
      const html = (await render(<WelcomeEmail name="Taio" {...urls} />)).replaceAll('<!-- -->', '')
      expect(html).toContain('Your first Nexez listing starts with what you already sell.')
      expect(html).toContain('Nexez carries a customer from discovery to booking and checkout.')
      expect(html).not.toMatch(/agent\.json|MCP endpoint|protocol endpoint/i)
    })
  })

  it('presents the founding cohort as a selective invitation', async () => {
    const fixture = emailPreviewFixtures.find((item) => item.id === 'campaign-founding-cohort')
    expect(fixture).toBeTruthy()
    const html = (await render(fixture!.element)).replaceAll('<!-- -->', '')
    expect(html).toContain('We want Aqua Clear Pool Care in the founding cohort')
    expect(html).toContain('Aqua Clear Pool Care</strong> stood out')
    expect(html).toContain('Accept your invitation')
    expect(html).not.toMatch(/Howdy neighbor|came up|we are building/i)
  })
})
