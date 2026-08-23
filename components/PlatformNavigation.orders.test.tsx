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

describe('platform Orders navigation', () => {
  it('makes Orders a first-class desktop destination', async () => {
    render(<PlatformShell><div>Content</div></PlatformShell>)
    const orders = await screen.findByRole('link', { name: 'Orders' })
    expect(orders).toHaveAttribute('href', '/dashboard/orders')
  })

  it('includes Orders in the mobile navigation sheet', async () => {
    render(<MobilePlatformNav />)
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    const orders = await screen.findByRole('link', { name: 'Orders' })
    expect(orders).toHaveAttribute('href', '/dashboard/orders')
  })
})
