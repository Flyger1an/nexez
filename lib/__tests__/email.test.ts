import { afterEach, describe, expect, it } from 'vitest'
import { buildNegotiationEmail, hasEmailEnv, sendEmail } from '../email'

describe('email gating', () => {
  const original = process.env.RESEND_API_KEY
  afterEach(() => {
    if (original === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = original
  })

  it('is dormant without RESEND_API_KEY', async () => {
    delete process.env.RESEND_API_KEY
    expect(hasEmailEnv()).toBe(false)
    const res = await sendEmail({ to: 'x@example.com', subject: 's', html: '<p>hi</p>' })
    expect(res).toEqual({ ok: false, skipped: true })
  })

  it('reports configured when the key is present', () => {
    process.env.RESEND_API_KEY = 're_test'
    expect(hasEmailEnv()).toBe(true)
  })
})

describe('buildNegotiationEmail', () => {
  it('includes the offer + provided fields and a deep link to the inbox', () => {
    const mail = buildNegotiationEmail({
      businessName: 'Axle Strategy',
      offerName: 'Strategy Session',
      budget: '$400',
      timeline: 'next week',
      query: 'Can you do a 90-min session?',
      buyerAgent: 'ChatGPT',
      inboxUrl: 'https://nexez.app/dashboard/negotiations',
    })
    expect(mail.subject).toBe('New negotiation request for Strategy Session')
    expect(mail.text).toContain('Budget: $400')
    expect(mail.text).toContain('From agent: ChatGPT')
    expect(mail.html).toContain('Strategy Session')
    expect(mail.html).toContain('https://nexez.app/dashboard/negotiations')
  })

  it('omits missing fields and escapes HTML', () => {
    const mail = buildNegotiationEmail({
      businessName: 'A & B <Co>',
      offerName: 'Audit',
      inboxUrl: 'https://nexez.app/dashboard/negotiations',
    })
    expect(mail.text).not.toContain('Budget:')
    expect(mail.html).toContain('A &amp; B &lt;Co&gt;')
    expect(mail.html).not.toContain('<Co>')
  })
})
