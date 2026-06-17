import { afterEach, describe, expect, it } from 'vitest'
import { buildEscrowFundedEmail, buildMoneyEventEmail, buildNegotiationEmail, hasEmailEnv, sendEmail } from '../email'

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
  it('includes the offer + provided fields and a deep link to the inbox', async () => {
    const mail = await buildNegotiationEmail({
      businessName: 'Apex Advisory',
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

  it('omits missing fields and escapes HTML', async () => {
    const mail = await buildNegotiationEmail({
      businessName: 'A & B <Co>',
      offerName: 'Audit',
      inboxUrl: 'https://nexez.app/dashboard/negotiations',
    })
    expect(mail.text).not.toContain('Budget:')
    expect(mail.html).toContain('A &amp; B &lt;Co&gt;')
    expect(mail.html).not.toContain('<Co>')
  })
})

describe('buildEscrowFundedEmail', () => {
  it('held: subject + status reflect an escrow hold awaiting capture', async () => {
    const mail = await buildEscrowFundedEmail({
      businessName: 'Apex Advisory',
      offerName: 'Strategy Session',
      amount: '¥1,000',
      held: true,
      buyerAgent: 'ChatGPT',
      inboxUrl: 'https://nexez.app/dashboard/negotiations',
    })
    expect(mail.subject).toBe('Payment held in escrow: Strategy Session')
    expect(mail.text).toContain('Amount: ¥1,000')
    expect(mail.text).toContain('Held in escrow')
    expect(mail.html).toContain('https://nexez.app/dashboard/negotiations')
  })

  it('captured: subject + status reflect an immediate (auto-settle) payment', async () => {
    const mail = await buildEscrowFundedEmail({
      businessName: 'A & B <Co>',
      offerName: 'Audit',
      amount: '$50',
      held: false,
      inboxUrl: 'https://nexez.app/dashboard/negotiations',
    })
    expect(mail.subject).toBe('Payment received: Audit')
    expect(mail.text).toContain('Status: Captured')
    expect(mail.html).toContain('A &amp; B &lt;Co&gt;') // escaped
  })
})

describe('buildMoneyEventEmail', () => {
  it('refund: informational subject + amount', async () => {
    const mail = await buildMoneyEventEmail({ kind: 'refund', businessName: 'Apex', offerName: 'Audit', amount: '$50', inboxUrl: 'https://nexez.app/dashboard/negotiations' })
    expect(mail.subject).toBe('Refund processed: Audit')
    expect(mail.text).toContain('Amount: $50')
    expect(mail.text).toContain('refunded to the buyer')
  })

  it('dispute_opened: urgent subject + the time-sensitive evidence warning', async () => {
    const mail = await buildMoneyEventEmail({ kind: 'dispute_opened', businessName: 'Apex', offerName: 'Audit', amount: '$50', detail: 'Reason: fraudulent', inboxUrl: 'https://nexez.app/dashboard/negotiations' })
    expect(mail.subject).toContain('Payment disputed: Audit')
    expect(mail.text).toContain('time-sensitive')
    expect(mail.text).toContain('Reason: fraudulent')
  })

  it('dispute_closed: resolution subject + outcome detail', async () => {
    const mail = await buildMoneyEventEmail({ kind: 'dispute_closed', businessName: 'Apex', offerName: 'Audit', detail: 'You won — funds retained.', inboxUrl: 'https://nexez.app/dashboard/negotiations' })
    expect(mail.subject).toBe('Dispute resolved: Audit')
    expect(mail.text).toContain('You won')
  })
})
