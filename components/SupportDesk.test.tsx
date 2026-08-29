// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SupportDesk } from './SupportDesk'

vi.mock('../utils/supabase/client', () => ({
  createClient: () => {
    const pagesBuilder: any = {
      select: () => pagesBuilder,
      eq: () => pagesBuilder,
      order: () => pagesBuilder,
      limit: () => pagesBuilder,
      returns: async () => ({ data: [], error: null }),
    }
    return {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: 'owner-1', email: 'owner@nexez.test' } },
        })),
      },
      from: () => pagesBuilder,
    }
  },
}))

describe('SupportDesk support service', () => {
  it('accepts a preselected feedback destination from the account menu', async () => {
    render(<SupportDesk initialCategory="general" initialSubject="Product feedback" />)

    expect(screen.getByLabelText('Issue area')).toHaveValue('general')
    expect(screen.getByLabelText('Subject')).toHaveValue('Product feedback')
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('separates Scale priority routing from incident severity', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      supportService: {
        planId: 'scale',
        tier: 'priority',
        priorityRouting: true,
        upgradePlanId: null,
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })))

    render(<SupportDesk />)

    expect(await screen.findByRole('heading', { name: 'Priority support' })).toBeInTheDocument()
    expect(screen.getByText('Incident severity')).toBeInTheDocument()
    expect(screen.getByText(/Urgent incident reporting is available on every plan/)).toBeInTheDocument()
  })

  it('shows standard support and the Scale upgrade when service resolution fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network unavailable')
    }))

    render(<SupportDesk />)

    expect(await screen.findByRole('heading', { name: 'Standard support' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Upgrade to Scale' })).toHaveAttribute('href', '/pricing')
  })

  it('shows recent request history with requester-facing status language', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      supportService: {
        planId: 'free',
        tier: 'standard',
        priorityRouting: false,
        upgradePlanId: 'scale',
      },
      tickets: [{
        id: '10000000-0000-4000-8000-000000000001',
        subject: 'Checkout incident',
        status: 'waiting_on_user',
        updatedAt: '2026-08-24T12:00:00.000Z',
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })))

    render(<SupportDesk />)

    expect(await screen.findByText('Your requests')).toBeInTheDocument()
    expect(screen.getByText('Checkout incident')).toBeInTheDocument()
    expect(screen.getByText('Waiting on you')).toBeInTheDocument()
  })
})
