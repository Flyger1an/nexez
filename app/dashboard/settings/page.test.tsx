import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const refs = vi.hoisted(() => ({
  user: {
    id: 'owner-1',
    email: 'owner@example.com',
    user_metadata: { full_name: 'Owner', company: 'Nexez', industry: 'Technology' },
  } as null | { id: string; email: string; user_metadata: Record<string, string> },
  pageError: false,
  listingError: false,
  storefrontError: false,
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({})) }))
vi.mock('../../../lib/server/plan', () => ({ getOwnerPlanId: vi.fn(async () => 'pro') }))
vi.mock('../../../lib/server/storefront', () => ({
  loadStorefrontsForOwner: vi.fn(async () => {
    if (refs.storefrontError) throw new Error('unavailable')
    return []
  }),
}))
vi.mock('../../../components/AccountDataControls', () => ({ AccountDataControls: () => <div>Account data controls</div> }))
vi.mock('../../../components/PasskeySettings', () => ({ PasskeySettings: () => <div>Passkey controls</div> }))
vi.mock('../../../components/ProfileSettings', () => ({ ProfileSettings: () => <div>Profile controls</div> }))
vi.mock('../../../components/StorefrontSettings', () => ({ StorefrontSettings: () => <div>Storefront controls</div> }))
vi.mock('../../../components/TeamInvites', () => ({ TeamInvites: () => <div>Team controls</div> }))
vi.mock('../../../components/billing/PlanGate', () => ({ PlanGate: ({ children }: { children: React.ReactNode }) => <>{children}</> }))

vi.mock('../../../utils/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: refs.user } })) },
    from: () => ({
      select(selection: string) {
        const assignmentQuery = selection.includes('storefront_id')
        const result = assignmentQuery
          ? { data: [], error: refs.listingError ? { message: 'listing failure' } : null }
          : {
              data: refs.pageError
                ? []
                : [{
                    id: 'page-1', owner_id: 'owner-1', name: 'Example listing', slug: 'example',
                    description: 'A clear description', website_url: 'https://example.com', cta_url: 'https://example.com/buy',
                    audience: 'Teams', industry: 'Technology', location: 'Austin', contact_email: 'owner@example.com',
                    products: [{ name: 'Plan', price: '$100' }], services: [], faqs: [{ question: 'Q', answer: 'A' }],
                    is_published: true, created_at: '2026-08-21T00:00:00.000Z',
                  }],
              error: refs.pageError ? { message: 'page failure' } : null,
            }
        const builder = {
          eq: () => builder,
          order: () => builder,
          returns: async () => result,
        }
        return builder
      },
    }),
  }),
}))

import AccountSettingsPage from './page'

describe('account settings control center', () => {
  beforeEach(() => {
    refs.user = {
      id: 'owner-1',
      email: 'owner@example.com',
      user_metadata: { full_name: 'Owner', company: 'Nexez', industry: 'Technology' },
    }
    refs.pageError = false
    refs.listingError = false
    refs.storefrontError = false
  })

  it('renders a wide, navigable settings architecture with live account metrics', async () => {
    const html = renderToStaticMarkup(await AccountSettingsPage())

    expect(html).toContain('max-w-[1680px]')
    expect(html).toContain('Account control center')
    expect(html).toContain('aria-label="Settings sections"')
    expect(html).toContain('Profile &amp; security')
    expect(html).toContain('Data controls')
    expect(html).toContain('Agent surfaces')
    expect(html).toContain('Example listing')
    expect(html).toContain('100%')
  })

  it('shows explicit unavailable states instead of reporting false zero metrics', async () => {
    refs.pageError = true
    refs.listingError = true
    refs.storefrontError = true

    const html = renderToStaticMarkup(await AccountSettingsPage())

    expect(html).toContain('Some live settings data is unavailable.')
    expect(html).toContain('Listing metrics and agent-surface status are temporarily unavailable.')
    expect(html).toContain('No zero values have been assumed.')
    expect(html).toContain('>—<')
  })

  it('keeps unauthenticated viewers out of account controls', async () => {
    refs.user = null

    const html = renderToStaticMarkup(await AccountSettingsPage())

    expect(html).toContain('Sign in to manage settings')
    expect(html).not.toContain('Account control center')
  })
})
