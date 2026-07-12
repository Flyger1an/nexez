// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '../../test/dom'
import { AgenticCheckoutUpgradeModal } from './AgenticCheckoutUpgradeModal'
import { getBillingPlan, minPlanForFeature } from '../../lib/billing'

describe('AgenticCheckoutUpgradeModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<AgenticCheckoutUpgradeModal open={false} onClose={() => {}} currentPlan="free" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the benefit pitch with a billing deep-link CTA (plan preselected)', () => {
    render(<AgenticCheckoutUpgradeModal open onClose={() => {}} currentPlan="free" />)
    expect(screen.getByRole('dialog', { name: /let agents check out/i })).toBeInTheDocument()
    const target = minPlanForFeature('agenticCheckout')
    const cta = screen.getByRole('link', { name: `Upgrade to ${target.name}` })
    expect(cta.getAttribute('href')).toContain(`/dashboard/billing?plan=${target.id}`)
  })

  it('derives the commission comparison from the catalog (never hardcoded)', () => {
    const pro = minPlanForFeature('agenticCheckout')
    // Free seller: 15% → 6%
    const { unmount } = render(<AgenticCheckoutUpgradeModal open onClose={() => {}} currentPlan="free" />)
    expect(screen.getByText(`${pro.commissionPercent}% commission instead of ${getBillingPlan('free')!.commissionPercent}%`)).toBeInTheDocument()
    unmount()
    // Launch seller sees the HONEST 8% → 6%, not the Free 15%.
    render(<AgenticCheckoutUpgradeModal open onClose={() => {}} currentPlan="launch" />)
    expect(screen.getByText(`${pro.commissionPercent}% commission instead of ${getBillingPlan('launch')!.commissionPercent}%`)).toBeInTheDocument()
  })

  it('an unknown/absent plan falls back to the Free comparison', () => {
    render(<AgenticCheckoutUpgradeModal open onClose={() => {}} currentPlan={null} />)
    expect(screen.getByText(/instead of 15%/)).toBeInTheDocument()
    expect(screen.getByText(/You stay discoverable on Free/)).toBeInTheDocument()
  })

  it('secondary CTA, close button, backdrop and Escape all dismiss (dialog itself does not)', () => {
    const onClose = vi.fn()
    render(<AgenticCheckoutUpgradeModal open onClose={onClose} currentPlan="free" />)
    fireEvent.click(screen.getByRole('button', { name: 'Keep discovery only' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('presentation'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(4)
    fireEvent.click(screen.getByRole('dialog', { name: /let agents check out/i }))
    expect(onClose).toHaveBeenCalledTimes(4) // click inside must not close
  })
})
