// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '../../test/dom'

vi.mock('../../app/admin/audit/actions', () => ({
  grantPlatformAdminAction: vi.fn(),
}))

import { GrantAdminAccess } from './GrantAdminAccess'

describe('GrantAdminAccess', () => {
  it('explains the existing-account requirement and collects an audited reason', () => {
    render(<GrantAdminAccess />)

    expect(screen.getByRole('heading', { name: 'Grant admin access' })).toBeInTheDocument()
    expect(screen.getByText(/must already have a Nexez account/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Account email')).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText('Reason or responsibility')).toHaveAttribute('maxlength', '500')
    expect(screen.getByRole('button', { name: 'Grant access' })).toBeEnabled()
  })
})
