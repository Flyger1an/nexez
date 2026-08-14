// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '../../test/dom'
import { AdminShell } from './AdminShell'

const refresh = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/growth',
  useRouter: () => ({ refresh }),
}))

describe('AdminShell', () => {
  beforeEach(() => vi.clearAllMocks())

  it('provides a separate, navigable admin surface with a working refresh control', () => {
    render(<AdminShell email="admin@nexez.ai"><div>Protected content</div></AdminShell>)

    expect(screen.getByText('Nexez Admin')).toBeInTheDocument()
    expect(screen.getByText('Protected content')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Growth Control/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /Back to seller dashboard/ })).toHaveAttribute('href', '/dashboard')

    fireEvent.click(screen.getByRole('button', { name: 'Refresh admin data' }))
    expect(refresh).toHaveBeenCalledOnce()
  })
})
