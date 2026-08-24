// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '../test/dom'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/orders',
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('../utils/supabase/client', () => ({
  createClient: () => {
    const result = { data: null, count: 0, error: null }
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      returns: async () => ({ ...result, data: [] }),
      maybeSingle: async () => result,
      then: (resolve: (value: typeof result) => void) => Promise.resolve(result).then(resolve),
    }
    return {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'owner-1' } } })) },
      from: () => builder,
    }
  },
}))

vi.mock('./ThemeToggle', () => ({ ThemeToggle: () => null }))
vi.mock('./NexezLogo', () => ({ NexezLogo: () => <span>Nexez</span> }))

import PlatformShell from './PlatformShell'
import { MobilePlatformNav } from './MobilePlatformNav'

const attention = {
  visibleCount: 2,
  urgentCount: 1,
  isTruncated: false,
  status: 'complete' as const,
  href: '/dashboard/commerce',
}

describe('platform Orders navigation', () => {
  it('makes the cross-rail Commerce view a first-class desktop destination', async () => {
    render(<PlatformShell><div>Content</div></PlatformShell>)
    const commerce = await screen.findByRole('link', { name: 'Commerce' })
    expect(commerce).toHaveAttribute('href', '/dashboard/commerce')
  })

  it('makes Orders a first-class desktop destination', async () => {
    render(<PlatformShell><div>Content</div></PlatformShell>)
    const orders = await screen.findByRole('link', { name: 'Orders' })
    expect(orders).toHaveAttribute('href', '/dashboard/orders')
  })

  it('includes Orders in the mobile navigation sheet', async () => {
    render(<MobilePlatformNav />)
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }))
    const orders = await screen.findByRole('link', { name: 'Orders' })
    expect(orders).toHaveAttribute('href', '/dashboard/orders')
  })

  it('includes Commerce in the mobile navigation sheet', async () => {
    render(<MobilePlatformNav />)
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }))
    const commerce = await screen.findByRole('link', { name: 'Commerce' })
    expect(commerce).toHaveAttribute('href', '/dashboard/commerce')
  })

  it('moves the persistent desktop attention badge from Negotiations to Commerce', async () => {
    render(<PlatformShell commerceAttention={attention}><div>Content</div></PlatformShell>)

    expect(await screen.findByRole('link', { name: 'Commerce, 2 commerce actions, 1 urgent' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Negotiations' })).toHaveAttribute('title', 'Negotiations')
  })

  it('keeps the canonical attention signal consistent in the mobile menu and sheet', async () => {
    render(<MobilePlatformNav commerceAttention={attention} />)

    fireEvent.click(screen.getByRole('button', {
      name: 'Open navigation menu, 2 commerce actions, 1 urgent',
    }))
    expect(await screen.findByRole('link', {
      name: 'Commerce, 2 commerce actions, 1 urgent',
    })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Negotiations' })).toHaveAttribute('title', 'Negotiations')
  })

  it('surfaces unavailable Commerce evidence instead of a zero-action badge', async () => {
    render(<PlatformShell commerceAttention={{
      visibleCount: 0,
      urgentCount: 0,
      isTruncated: false,
      status: 'unavailable',
      href: '/dashboard/commerce',
    }}><div>Content</div></PlatformShell>)

    expect(await screen.findByRole('link', {
      name: 'Commerce, Commerce actions unavailable',
    })).toBeInTheDocument()
  })
})
