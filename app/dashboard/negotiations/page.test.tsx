// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '../../../test/dom'

const refs = vi.hoisted(() => ({
  negotiationEnabled: false,
  negotiations: [] as any[],
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('../../../components/billing/PlanGate', () => ({
  UpgradeBanner: () => null,
}))

vi.mock('../../../components/billing/PlanProvider', () => ({
  usePlanEntitlements: () => ({
    planId: refs.negotiationEnabled ? 'pro' : 'free',
    features: { negotiation: refs.negotiationEnabled },
    limits: {},
  }),
}))

vi.mock('../../../lib/negotiation-report', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/negotiation-report')>()
  return {
    ...actual,
    loadNegotiationRollup: vi.fn(async () => ({ data: null, error: null })),
  }
})

vi.mock('../../../utils/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'owner-1' } } })),
    },
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        or: () => builder,
        order: () => builder,
        limit: () => builder,
        returns: vi.fn(async () => ({ data: refs.negotiations, error: null })),
      }
      return builder
    },
  }),
}))

import NegotiationsInbox from './page'

function negotiation(status: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `neg-${status}`,
    page_id: 'page-1',
    slug: 'example',
    offer_key: 'services-0',
    offer_name: `${status} offer`,
    offer_kind: 'services',
    buyer_agent: 'Buyer Bot',
    buyer_query: 'Please help',
    requested_terms: {},
    budget_text: '$100',
    timeline_text: 'Next week',
    contact: 'buyer@example.com',
    buyer_email: 'buyer@example.com',
    status,
    escrow_mode: 'manual_capture_ready',
    amount_cents: 10_000,
    currency: 'usd',
    refunded_cents: 0,
    stripe_payment_intent_id: null,
    settlement_state: null,
    decision_pending: false,
    metadata: {},
    created_at: '2026-08-20T12:00:00.000Z',
    updated_at: '2026-08-20T12:00:00.000Z',
    ...overrides,
  }
}

async function cardFor(offerName: string) {
  const heading = await screen.findByRole('heading', { name: offerName })
  const card = heading.closest('article')
  if (!card) throw new Error(`Missing card for ${offerName}`)
  return card
}

describe('negotiation inbox downgrade controls', () => {
  beforeEach(() => {
    refs.negotiationEnabled = false
    refs.negotiations = []
  })

  it('labels and disables resume while preserving reject for a paused deal', async () => {
    refs.negotiations = [negotiation('paused')]
    render(<NegotiationsInbox />)
    const card = await cardFor('paused offer')
    const controls = within(card)

    expect(controls.getByRole('button', { name: /Reopen · Pro/i })).toBeDisabled()
    expect(controls.getByRole('button', { name: 'Decline' })).toBeEnabled()

    const select = card.querySelector<HTMLSelectElement>('select[aria-label="Seller decision"]')
    expect(select).not.toBeNull()
    expect(select?.value).toBe('reject')
    const resume = Array.from(select?.options ?? []).find((option) => option.value === 'resume')
    const reject = Array.from(select?.options ?? []).find((option) => option.value === 'reject')
    expect(resume).toBeDisabled()
    expect(resume?.textContent).toContain('(Pro)')
    expect(reject).toBeEnabled()
  })

  it('preserves accept, reject, pause, and settlement while disabling expansion edits', async () => {
    refs.negotiations = [
      negotiation('negotiation'),
      negotiation('agreement_proposed', { settlement_state: 'awaiting_approval' }),
      negotiation('held', {
        escrow_mode: 'manual_capture_created',
        stripe_payment_intent_id: 'pi_held',
      }),
    ]
    render(<NegotiationsInbox />)

    const active = await cardFor('negotiation offer')
    const decision = active.querySelector<HTMLSelectElement>('select[aria-label="Seller decision"]')
    expect(decision?.value).toBe('accept')
    expect(Array.from(decision?.options ?? []).find((option) => option.value === 'accept')).toBeEnabled()
    expect(Array.from(decision?.options ?? []).find((option) => option.value === 'reject')).toBeEnabled()
    expect(Array.from(decision?.options ?? []).find((option) => option.value === 'pause')).toBeEnabled()
    expect(Array.from(decision?.options ?? []).find((option) => option.value === 'counter')).toBeDisabled()
    expect(Array.from(decision?.options ?? []).find((option) => option.value === 'clarify')).toBeDisabled()
    expect(within(active).getByLabelText('Amount in USD')).toHaveAttribute('readonly')
    expect(within(active).getByText(/Counteroffers, questions, reopening, and amount changes require Pro/i)).toBeInTheDocument()

    const agreement = await cardFor('agreement_proposed offer')
    expect(within(agreement).getByLabelText('Agreed amount in USD')).toBeDisabled()
    expect(within(agreement).getByRole('button', { name: /Save amount · Pro/i })).toBeDisabled()
    expect(within(agreement).getByRole('button', { name: /Approve & request payment/i })).toBeEnabled()
    expect(within(agreement).getByRole('button', { name: 'Pause' })).toBeEnabled()
    expect(within(agreement).getByRole('button', { name: 'Decline' })).toBeEnabled()

    const held = await cardFor('held offer')
    expect(within(held).getByRole('button', { name: 'Capture funds' })).toBeEnabled()
    expect(within(held).getByRole('button', { name: 'Release hold' })).toBeEnabled()
  })

  it('keeps the initial accept amount editable when no amount has been saved', async () => {
    refs.negotiations = [negotiation('negotiation', { amount_cents: null })]
    render(<NegotiationsInbox />)
    const card = await cardFor('negotiation offer')

    expect(within(card).getByLabelText('Amount in USD')).toBeEnabled()
    expect(card.querySelector<HTMLSelectElement>('select[aria-label="Seller decision"]')?.value).toBe('accept')
    expect(card.querySelector<HTMLButtonElement>('button[type="submit"]')).toBeEnabled()
  })

  it('enables resume, counter, clarification, and amount changes on Pro', async () => {
    refs.negotiationEnabled = true
    refs.negotiations = [
      negotiation('paused'),
      negotiation('negotiation'),
      negotiation('agreement_proposed'),
    ]
    render(<NegotiationsInbox />)

    const paused = await cardFor('paused offer')
    expect(within(paused).getByRole('button', { name: 'Reopen' })).toBeEnabled()
    const resume = Array.from(paused.querySelector<HTMLSelectElement>('select[aria-label="Seller decision"]')?.options ?? [])
      .find((option) => option.value === 'resume')
    expect(resume).toBeEnabled()

    const active = await cardFor('negotiation offer')
    const actions = active.querySelector<HTMLSelectElement>('select[aria-label="Seller decision"]')
    expect(actions?.value).toBe('counter')
    expect(Array.from(actions?.options ?? []).find((option) => option.value === 'counter')).toBeEnabled()
    expect(Array.from(actions?.options ?? []).find((option) => option.value === 'clarify')).toBeEnabled()

    const agreement = await cardFor('agreement_proposed offer')
    expect(within(agreement).getByLabelText('Agreed amount in USD')).toBeEnabled()
    expect(within(agreement).getByRole('button', { name: 'Save amount' })).toBeEnabled()
  })
})
