// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '../../../test/dom'
import type { PlanId } from '../../../lib/billing'
import type { StripeConnectReadinessInput } from '../../../lib/stripe-connect-readiness'

const refs = vi.hoisted(() => ({
  plan: 'free' as PlanId,
  integrations: [] as Array<{ provider: string; status: string; detail: string | null; last_event_at: string }>,
  connect: null as StripeConnectReadinessInput,
}))

vi.mock('../../../components/billing/PlanProvider', () => ({
  usePlanEntitlements: () => ({
    planId: refs.plan,
    features: { integrations: refs.plan === 'pro' || refs.plan === 'scale' || refs.plan === 'enterprise' },
    limits: {},
  }),
}))

vi.mock('../../../lib/integration-status', () => ({
  loadIntegrations: vi.fn(async () => refs.integrations),
  loadStripeConnectStatus: vi.fn(async () => refs.connect),
}))

import IntegrationsPage from './page'

function card(name: string) {
  const article = screen.getByRole('button', { name: `${name} options` }).closest('article')
  expect(article).not.toBeNull()
  return within(article as HTMLElement)
}

describe('dashboard integration allocation', () => {
  beforeEach(() => {
    refs.plan = 'free'
    refs.integrations = []
    refs.connect = null
    localStorage.clear()
  })

  it.each(['free', 'launch'] as const)('keeps payouts open and locks premium connectors on %s', async (plan) => {
    refs.plan = plan
    render(<IntegrationsPage />)

    await waitFor(() => expect(card('Stripe payouts').getByText('Setup required')).toBeVisible())
    expect(card('Stripe payouts').getByRole('link', { name: 'Set up payouts' })).toHaveAttribute(
      'href',
      '/dashboard/billing',
    )
    expect(card('Stripe payouts').queryByText('Pro')).not.toBeInTheDocument()

    expect(card('Shopify App Store').getByText('Every plan')).toBeVisible()
    expect(card('Shopify App Store').queryByText('Pro')).not.toBeInTheDocument()
    expect(card('Shopify App Store').getByRole('link', { name: 'Installation steps' })).toHaveAttribute(
      'href',
      '/dashboard/shopify',
    )

    for (const name of ['Stripe catalog', 'Calendly', 'Shopify Admin import', 'Square', 'Acuity Scheduling', 'Google Calendar', 'WooCommerce', 'ServiceM8']) {
      expect(card(name).getByText('Pro')).toBeVisible()
      expect(card(name).getByRole('link', { name: 'Upgrade to connect' })).toBeVisible()
    }
  })

  it('unlocks premium connectors for an explicit Pro entitlement', async () => {
    refs.plan = 'pro'
    render(<IntegrationsPage />)

    await waitFor(() => expect(card('Stripe payouts').getByText('Setup required')).toBeVisible())
    for (const name of ['Stripe catalog', 'Calendly', 'Shopify Admin import', 'Square', 'Acuity Scheduling', 'Google Calendar', 'WooCommerce', 'ServiceM8']) {
      expect(card(name).queryByText('Pro')).not.toBeInTheDocument()
      expect(card(name).queryByRole('link', { name: 'Upgrade to connect' })).not.toBeInTheDocument()
    }
    expect(card('Google Calendar').getByText('Available')).toBeVisible()
    expect(card('Google Calendar').getByText(/connect with OAuth.*live free\/busy/i)).toBeVisible()
    expect(card('Google Calendar').getByRole('link', { name: 'Open listings' })).toHaveAttribute('href', '/dashboard')
  })

  it('treats charges-enabled but payouts-disabled Connect state as incomplete', async () => {
    refs.connect = {
      stripe_connect_account_id: 'acct_partial',
      stripe_connect_charges_enabled: true,
      stripe_connect_payouts_enabled: false,
    }
    render(<IntegrationsPage />)

    await waitFor(() => expect(card('Stripe payouts').getByText('Setup incomplete')).toBeVisible())
    expect(card('Stripe payouts').queryByText('Payouts ready')).not.toBeInTheDocument()
    expect(card('Stripe payouts').getByRole('link', { name: 'Finish setup' })).toHaveAttribute(
      'href',
      '/dashboard/billing',
    )
  })

  it('shows payout readiness only when account, charges, and payouts are all ready', async () => {
    refs.connect = {
      stripe_connect_account_id: 'acct_ready',
      stripe_connect_charges_enabled: true,
      stripe_connect_payouts_enabled: true,
    }
    render(<IntegrationsPage />)

    await waitFor(() => expect(card('Stripe payouts').getByText('Payouts ready')).toBeVisible())
    expect(card('Stripe payouts').getByRole('link', { name: 'Manage payouts' })).toHaveAttribute(
      'href',
      '/dashboard/billing',
    )
  })

  it('shows saved premium catalog state as paused after a downgrade', async () => {
    refs.plan = 'free'
    refs.integrations = [{
      provider: 'stripe',
      status: 'connected',
      detail: null,
      last_event_at: '2026-08-22T18:00:00.000Z',
    }]
    render(<IntegrationsPage />)

    await waitFor(() => expect(card('Stripe catalog').getByText('Paused by plan')).toBeVisible())
    expect(card('Stripe catalog').queryByText('Connected')).not.toBeInTheDocument()
  })

  it('pauses a retained manual Shopify import without locking the installed app', async () => {
    refs.plan = 'free'
    refs.integrations = [{
      provider: 'shopify',
      status: 'connected',
      detail: 'Manual Admin API import',
      last_event_at: '2026-08-22T18:00:00.000Z',
    }]
    render(<IntegrationsPage />)

    await waitFor(() => expect(card('Shopify Admin import').getByText('Paused by plan')).toBeVisible())
    expect(card('Shopify Admin import').getByRole('link', { name: 'Upgrade to connect' })).toBeVisible()
    expect(card('Shopify App Store').getByText('Every plan')).toBeVisible()
    expect(card('Shopify App Store').getByRole('link', { name: 'Installation steps' })).toHaveAttribute(
      'href',
      '/dashboard/shopify',
    )
  })
})
