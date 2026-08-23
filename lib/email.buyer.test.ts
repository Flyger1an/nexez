import { describe, it, expect } from 'vitest'
import { buildBuyerReceiptEmail, buildBuyerStatusEmail, buildBuyerRequestEmail, buildOrderLookupEmail, buildTeamInviteEmail } from './email'

describe('buildTeamInviteEmail', () => {
  it('names the inviter, role, accept link, and stresses the exact-email requirement', async () => {
    const m = await buildTeamInviteEmail({
      inviterEmail: 'owner@example.com',
      inviteeEmail: 'mate@example.com',
      role: 'editor',
      acceptUrl: 'https://app.nexez.ai/login?next=/dashboard',
    })
    expect(m.subject).toContain('owner@example.com')
    expect(m.html).toContain('https://app.nexez.ai/login?next=/dashboard')
    expect(m.html).toContain('mate@example.com') // the address they must use
    expect(m.text.toLowerCase()).toContain('this email address')
    expect(m.html.toLowerCase()).toContain('edit')
    expect(m.text).toContain('edit their listings')
    expect(m.text.toLowerCase()).not.toContain('negotiations')
  })
  it('uses read-only copy for a viewer role', async () => {
    const m = await buildTeamInviteEmail({ inviterEmail: 'o@x.com', inviteeEmail: 'v@x.com', role: 'viewer', acceptUrl: 'u' })
    expect(m.html.toLowerCase()).toContain('read-only')
  })
})

describe('buildOrderLookupEmail', () => {
  it('carries the find link + singular copy for one order', async () => {
    const m = await buildOrderLookupEmail({ count: 1, findUrl: 'https://nexez.app/orders/find/tok' })
    expect(m.html).toContain('https://nexez.app/orders/find/tok')
    expect(m.text).toContain('https://nexez.app/orders/find/tok')
    expect(m.subject.toLowerCase()).toContain('orders')
    expect(m.text.toLowerCase()).toContain('the order')
  })
  it('pluralizes for multiple orders + mentions expiry', async () => {
    const m = await buildOrderLookupEmail({ count: 3, findUrl: 'https://nexez.app/orders/find/tok' })
    expect(m.text).toContain('3 orders')
    expect(m.text.toLowerCase()).toContain('24 hours')
  })
})

describe('buildBuyerReceiptEmail', () => {
  it('includes the seller, amount + portal link', async () => {
    const m = await buildBuyerReceiptEmail({
      businessName: 'Acme',
      offerName: 'Logo design',
      amount: '$50.00',
      manageUrl: 'https://nexez.app/orders/tok123',
    })
    expect(m.subject).toContain('Acme')
    expect(m.html).toContain('https://nexez.app/orders/tok123')
    expect(m.html).toContain('$50.00')
    expect(m.text).toContain('Logo design')
  })

  it('escapes HTML in the business name', async () => {
    const m = await buildBuyerReceiptEmail({ businessName: '<script>x</script>', offerName: 'x', amount: '$1', manageUrl: 'u' })
    expect(m.html).not.toContain('<script>x</script>')
    expect(m.html).toContain('&lt;script&gt;')
  })
})

describe('buildBuyerStatusEmail', () => {
  it('refunded copy mentions the refund', async () => {
    const m = await buildBuyerStatusEmail({ kind: 'refunded', businessName: 'Acme', offerName: 'X', amount: '$50.00', manageUrl: 'u' })
    expect(m.subject.toLowerCase()).toContain('refund')
    expect(m.html).toContain('$50.00')
  })

  it('request_received acknowledges to the buyer', async () => {
    const m = await buildBuyerStatusEmail({ kind: 'request_received', businessName: 'Acme', offerName: 'X', manageUrl: 'u' })
    expect(m.subject.toLowerCase()).toContain('received')
  })

  it('partial_refund has its own subject', async () => {
    const m = await buildBuyerStatusEmail({ kind: 'partial_refund', businessName: 'Acme', offerName: 'X', manageUrl: 'u' })
    expect(m.subject.toLowerCase()).toContain('partial')
  })
})

describe('buildBuyerRequestEmail', () => {
  it('refund_request drives the seller to Finance + surfaces the buyer', async () => {
    const m = await buildBuyerRequestEmail({
      kind: 'refund_request',
      businessName: 'Acme',
      offerName: 'Logo',
      amount: '$50.00',
      message: 'wrong item',
      buyerEmail: 'buyer@example.com',
      inboxUrl: 'https://app.nexez.ai/dashboard/finance',
    })
    expect(m.subject.toLowerCase()).toContain('refund')
    expect(m.html).toContain('buyer@example.com')
    expect(m.html).toContain('wrong item')
    expect(m.text).toContain('https://app.nexez.ai/dashboard/finance')
  })

  it('problem_report uses problem copy', async () => {
    const m = await buildBuyerRequestEmail({ kind: 'problem_report', businessName: 'Acme', offerName: 'Logo', inboxUrl: 'u' })
    expect(m.subject.toLowerCase()).toContain('problem')
  })
})
