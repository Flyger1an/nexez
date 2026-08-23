// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../test/dom'
import { getPlanFeatureEntitlements, getSerializablePlanLimits, type PlanId } from '../lib/billing'
import type { StorefrontWithCount } from '../lib/storefront'
import { PlanProvider } from './billing/PlanProvider'
import { StorefrontSettings } from './StorefrontSettings'

const STOREFRONT: StorefrontWithCount = {
  id: 'sf-1',
  owner_id: 'owner-1',
  handle: 'acme',
  display_name: 'Acme',
  description: 'Public store',
  logo_url: 'https://cdn.example/logo.svg',
  accent_color: '#ff6a33',
  plan_suspended_at: null,
  listing_count: 1,
}

function view(planId: PlanId = 'free') {
  return render(
    <PlanProvider entitlements={{
      planId,
      features: getPlanFeatureEntitlements(planId),
      limits: getSerializablePlanLimits(planId),
    }}>
      <StorefrontSettings
        storefronts={[STOREFRONT]}
        listings={[{ id: 'page-1', name: 'Offer', slug: 'offer', is_published: true, storefront_id: 'sf-1' }]}
      />
    </PlanProvider>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('StorefrontSettings entitlement lifecycle', () => {
  it('keeps retained branding visible for cleanup but omits it from ordinary Free updates', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      return new Response(JSON.stringify({
        ok: true,
        storefront: { ...STOREFRONT, ...body },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    view('free')

    expect(screen.getByRole('textbox', { name: 'Logo URL' })).toBeDisabled()
    expect(screen.getByLabelText('Accent color')).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Upgrade to Launch' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save storefront' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body).not.toHaveProperty('logo_url')
    expect(body).not.toHaveProperty('accent_color')
  })

  it('requires confirmation before removal and retains the assigned listing', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => new Response(
      JSON.stringify({ ok: true, id: JSON.parse(String(init?.body)).id }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)
    view('pro')

    fireEvent.click(screen.getByRole('button', { name: 'Remove storefront' }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText(/1 assigned listing will be kept but unassigned/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove' }))

    await waitFor(() => expect(screen.getByText(/listings were kept and can be reassigned/)).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith('/api/storefront', expect.objectContaining({ method: 'DELETE' }))
  })
})
