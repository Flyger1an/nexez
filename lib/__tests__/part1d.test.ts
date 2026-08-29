import { describe, it, expect } from 'vitest'
import { getCertification, type AgentPage } from '../agent-page'
import { buildBookingEmail } from '../email'

const completePage: Partial<AgentPage> = {
  name: 'Apex Advisory',
  slug: 'apex-advisory',
  description: 'Premium strategy.',
  website_url: 'https://apexadvisory.com',
  cta_url: 'https://apexadvisory.com/book',
  audience: 'Founders',
  industry: 'Consulting',
  location: 'Austin, TX',
  contact_email: 'hi@apexadvisory.com',
  services: [{ name: 'Session', price: '$450', description: 'x', url: '' }],
  products: [],
  faqs: [{ question: 'Q', answer: 'A' }],
  is_published: true,
}

describe('getCertification', () => {
  it('certifies a published page only when every standard check passes', () => {
    const cert = getCertification(completePage)
    expect(cert.certified).toBe(true)
    expect(cert.level).toBe('agent-ready')
    expect(cert.status).toBe('certified')
    expect(cert.readiness).toBe(100)
    expect(cert.label).toBe('Nexez Certified Agent-Ready')
    expect(cert.standard).toMatchObject({
      id: 'nexez.agent-ready',
      version: '2026.1',
      threshold: 100,
    })
    expect(cert.criteria_met).toBe(cert.criteria_total)
    expect(cert.missing).toEqual([])
  })

  it('does not certify an unpublished page even at full readiness', () => {
    const cert = getCertification({ ...completePage, is_published: false })
    expect(cert.certified).toBe(false)
    expect(cert.status).toBe('unpublished')
    expect(cert.label).toBeNull()
    expect(cert.missing).toEqual([
      expect.objectContaining({ id: 'publish', label: 'Published' }),
    ])
  })

  it('does not certify a sparse page', () => {
    const cert = getCertification({ name: 'Bare', slug: 'bare', is_published: true })
    expect(cert.certified).toBe(false)
    expect(cert.status).toBe('incomplete')
    expect(cert.missing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'description' }),
        expect.objectContaining({ id: 'offers' }),
      ]),
    )
  })
})

describe('buildBookingEmail', () => {
  it('builds a subject + rows and escapes html', async () => {
    const mail = await buildBookingEmail({
      businessName: 'Apex <b>Advisory</b>',
      eventName: 'Strategy Session',
      inviteeName: 'Jane',
      inviteeEmail: 'jane@example.com',
      startTime: '2026-06-10T15:00:00Z',
      source: 'Calendly',
      inboxUrl: 'https://nexez.app/dashboard',
    })
    expect(mail.subject).toBe('Booking confirmed: Strategy Session')
    expect(mail.text).toContain('Jane')
    expect(mail.html).toContain('Apex &lt;b&gt;Advisory&lt;/b&gt;') // escaped
    expect(mail.html).not.toContain('<b>Advisory</b>')
  })
})
