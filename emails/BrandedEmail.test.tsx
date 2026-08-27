import { render } from '@react-email/render'
import { describe, expect, it } from 'vitest'
import { BrandedEmail, EmailEyebrow, EmailHeading, InfoRows, Lead, PrimaryButton, StatusBadge } from './BrandedEmail'
import { BRAND, LOGO_H, LOGO_W, NEXEZ_EMAIL_LOGO_URL } from './theme'

describe('BrandedEmail', () => {
  it('renders the official Nexez lockup, semantic state, secure CTA, and support footer', async () => {
    const html = await render(
      <BrandedEmail preview="Your payment is confirmed">
        <EmailEyebrow>Receipt</EmailEyebrow>
        <StatusBadge tone="positive">Paid</StatusBadge>
        <EmailHeading>Your order is confirmed</EmailHeading>
        <Lead>The seller has received your order.</Lead>
        <InfoRows rows={[['Amount', '$50.00'], ['Missing', null]]} />
        <PrimaryButton href="https://nexez.app/orders/token">View your order</PrimaryButton>
      </BrandedEmail>,
    )

    expect(html).toContain(NEXEZ_EMAIL_LOGO_URL.replaceAll('&', '&amp;'))
    expect(html).toContain('alt="Nexez"')
    // Asserted through the tokens rather than literals, so a brand change does not
    // break the test for the wrong reason. The previous version hard-coded #0a0a0a
    // and 40x40 and failed the moment the palette and the lockup were corrected.
    expect(html).toContain(`height="${LOGO_H}"`)
    expect(html).toContain(`width="${LOGO_W}"`)
    expect(html).toContain('border="0"')
    expect(html).toContain(`background-image:linear-gradient(${BRAND.ink}, ${BRAND.ink})`)
    expect(html).not.toContain('Nexez AI')
    expect(html).toContain('Paid')
    expect(html).toContain('$50.00')
    expect(html).not.toContain('Missing')
    expect(html).toContain('https://nexez.app/orders/token')
    expect(html).toContain('Reply to this email for support.')
    expect(html).not.toContain('mailto:')
    expect(html).not.toContain('>Nexez</p>')
  })

  it('pins the masthead so a dark-mode engine cannot recolour it', async () => {
    const html = await render(<BrandedEmail preview="x"><Lead>y</Lead></BrandedEmail>)

    // Gmail rewrote the masthead precisely because it was the one region with no
    // class for the <style> block to hold. Both the bar and the logo cell are
    // pinned now, outside the media query so they apply in light mode too.
    expect(html).toContain('class="nx-masthead"')
    expect(html).toContain('nx-logocell')
    expect(html).toMatch(/\.nx-masthead,\s*\.nx-logocell\s*\{\s*background-color:#0D1016\s*!important/)
    expect(html).toContain('[data-ogsc] .nx-masthead')
  })

  it('ships a dark palette for every region it paints in light', async () => {
    const html = await render(<BrandedEmail preview="x"><Lead>y</Lead></BrandedEmail>)
    const styleBlock = html.slice(html.indexOf('<style>'), html.indexOf('</style>'))

    for (const token of ['.nx-body', '.nx-frame', '.nx-panel', '.nx-fill', '.nx-ink', '.nx-muted', '.nx-faint', '.nx-rule', '.nx-link']) {
      expect(styleBlock).toContain(token)
    }
    expect(styleBlock).toContain('@media (prefers-color-scheme: dark)')
    expect(html).toContain('content="light dark"')
  })
})
