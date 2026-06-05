import { describe, it, expect } from 'vitest'
import { getCertification, type AgentPage } from '../agent-page'
import { buildBookingEmail } from '../email'

const completePage: Partial<AgentPage> = {
  name: 'Axle Strategy',
  slug: 'axle',
  description: 'Premium strategy.',
  website_url: 'https://axle.com',
  cta_url: 'https://axle.com/book',
  audience: 'Founders',
  industry: 'Consulting',
  location: 'Austin, TX',
  contact_email: 'hi@axle.com',
  services: [{ name: 'Session', price: '$450', description: 'x', url: '' }],
  products: [],
  faqs: [{ question: 'Q', answer: 'A' }],
  is_published: true,
}

describe('getCertification', () => {
  it('certifies a published page at 95%+ readiness', () => {
    const cert = getCertification(completePage)
    expect(cert.certified).toBe(true)
    expect(cert.level).toBe('agent-ready')
    expect(cert.readiness).toBeGreaterThanOrEqual(95)
    expect(cert.label).toBe('Nexez Certified Agent-Ready')
  })

  it('does not certify an unpublished page even at full readiness', () => {
    const cert = getCertification({ ...completePage, is_published: false })
    expect(cert.certified).toBe(false)
    expect(cert.label).toBeNull()
  })

  it('does not certify a sparse page', () => {
    const cert = getCertification({ name: 'Bare', slug: 'bare', is_published: true })
    expect(cert.certified).toBe(false)
  })
})

describe('buildBookingEmail', () => {
  it('builds a subject + rows and escapes html', () => {
    const mail = buildBookingEmail({
      businessName: 'Axle <b>Strategy</b>',
      eventName: 'Strategy Session',
      inviteeName: 'Jane',
      inviteeEmail: 'jane@example.com',
      startTime: '2026-06-10T15:00:00Z',
      source: 'Calendly',
      inboxUrl: 'https://nexez.app/dashboard',
    })
    expect(mail.subject).toBe('New booking: Strategy Session')
    expect(mail.text).toContain('Jane')
    expect(mail.html).toContain('Axle &lt;b&gt;Strategy&lt;/b&gt;') // escaped
    expect(mail.html).not.toContain('<b>Strategy</b>')
  })
})
