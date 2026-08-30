// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AccountDataControls } from './AccountDataControls'

const { signOut, signInWithPassword } = vi.hoisted(() => ({
  signOut: vi.fn(async () => ({ error: null })),
  signInWithPassword: vi.fn(async () => ({ error: null })),
}))

vi.mock('../utils/supabase/client', () => ({
  createClient: () => ({ auth: { signOut, signInWithPassword } }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }))

describe('AccountDataControls', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.restoreAllMocks()
    signOut.mockClear()
    signInWithPassword.mockClear()
  })

  it('describes buyer-data removal separately from seller workspace closure', () => {
    render(<AccountDataControls email="owner@example.com" />)

    expect(screen.getByText(/Your Nexez seller workspace, listings, financial records, API keys, and sign-in remain available/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Request workspace closure/i })).toHaveAttribute('href', '/support')
    expect(screen.queryByText(/permanently removes your listings, analytics, negotiations, and API keys/i)).not.toBeInTheDocument()
  })

  it('keeps the seller signed in and reports the retained workspace after buyer-data removal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, sellerRetained: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })))
    render(<AccountDataControls email="owner@example.com" />)

    fireEvent.change(screen.getByLabelText(/Confirm buyer-data deletion/i), { target: { value: 'owner@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue to identity check' }))
    fireEvent.change(screen.getByLabelText(/Account password for deletion confirmation/i), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm password and remove' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Seller workspace and sign-in were kept/i))
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'owner@example.com', password: 'secret' })
    expect(signOut).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/Confirm buyer-data deletion/i)).toHaveValue('')
  })

  it('surfaces route failures as an alert', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Deletion unavailable.' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    })))
    render(<AccountDataControls email="owner@example.com" />)

    fireEvent.change(screen.getByLabelText(/Confirm buyer-data deletion/i), { target: { value: 'owner@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue to identity check' }))
    fireEvent.change(screen.getByLabelText(/Account password for deletion confirmation/i), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm password and remove' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Deletion unavailable.'))
    expect(signOut).not.toHaveBeenCalled()
  })

  it('does not call the destructive route when password confirmation fails', async () => {
    signInWithPassword.mockResolvedValueOnce({ error: new Error('invalid') } as never)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<AccountDataControls email="owner@example.com" />)

    fireEvent.change(screen.getByLabelText(/Confirm buyer-data deletion/i), { target: { value: 'owner@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue to identity check' }))
    fireEvent.change(screen.getByLabelText(/Account password for deletion confirmation/i), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm password and remove' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not confirm/i))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
