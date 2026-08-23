// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../test/dom'
import { NotificationPreferencesPanel } from './NotificationPreferencesPanel'

const defaults = {
  transactions: true,
  negotiations: true,
  integrations: true,
  reviews: true,
  marketing: true,
}

afterEach(() => {
  vi.unstubAllGlobals()
})
describe('NotificationPreferencesPanel', () => {
  it('renders transaction notices as required and immutable', () => {
    render(<NotificationPreferencesPanel initialPreferences={defaults} />)
    const control = screen.getByTestId('seller-notification-transactions')
    expect(control).toBeDisabled()
    expect(control).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Required')).toBeVisible()
  })

  it('persists an optional category through the seller API', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        configured: true,
        preferences: { ...defaults, negotiations: false },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    render(<NotificationPreferencesPanel initialPreferences={defaults} />)

    fireEvent.click(screen.getByTestId('seller-notification-negotiations'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith('/api/seller/notification-preferences', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ preferences: { negotiations: false } }),
    })
    await waitFor(() => {
      expect(screen.getByTestId('seller-notification-negotiations')).toHaveAttribute('aria-checked', 'false')
      expect(screen.getByText(/saved across your devices/i)).toBeVisible()
    })
  })

  it('rolls back an optimistic toggle when the server rejects it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: 'Policy store unavailable.' }),
    })))
    render(<NotificationPreferencesPanel initialPreferences={defaults} />)

    fireEvent.click(screen.getByTestId('seller-notification-reviews'))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Policy store unavailable.'))
    expect(screen.getByTestId('seller-notification-reviews')).toHaveAttribute('aria-checked', 'true')
  })
})
