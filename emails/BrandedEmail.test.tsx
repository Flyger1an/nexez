import { render } from '@react-email/render'
import { describe, expect, it } from 'vitest'
import { BrandedEmail, EmailEyebrow, EmailHeading, InfoRows, Lead, PrimaryButton, StatusBadge } from './BrandedEmail'
import { NEXEZ_EMAIL_LOGO_URL } from './theme'

describe('BrandedEmail', () => {
  it('renders the official Nexez AI logo, semantic state, secure CTA, and support footer', async () => {
    const html = await render(
      <BrandedEmail preview="Your payment is confirmed" category="Buyer order">
        <EmailEyebrow>Order update</EmailEyebrow>
        <StatusBadge tone="positive">Payment confirmed</StatusBadge>
        <EmailHeading>Your order is confirmed</EmailHeading>
        <Lead>The seller has received your order.</Lead>
        <InfoRows rows={[["Amount", '$50.00'], ['Missing', null]]} />
        <PrimaryButton href="https://nexez.app/orders/token">View your order</PrimaryButton>
      </BrandedEmail>,
    )

    expect(html).toContain(NEXEZ_EMAIL_LOGO_URL.replaceAll('&', '&amp;'))
    expect(html).toContain('alt="Nexez AI"')
    expect(html).toContain('Payment confirmed')
    expect(html).toContain('$50.00')
    expect(html).not.toContain('Missing')
    expect(html).toContain('https://nexez.app/orders/token')
    expect(html).toContain('Reply to this email for support.')
    expect(html).not.toContain('mailto:')
    expect(html).not.toContain('>Nexez</p>')
  })
})
