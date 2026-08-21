// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../test/dom'
import { LoginForm } from './LoginForm'

const { auth } = vi.hoisted(() => ({
  auth: {
    signInWithPasskey: vi.fn(),
  },
}))

vi.mock('../utils/supabase/client', () => ({
  createClient: () => ({ auth }),
}))

function enableWebAuthn() {
  Object.defineProperty(window, 'PublicKeyCredential', {
    configurable: true,
    value: class PublicKeyCredential {},
  })
  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    value: { create: vi.fn(), get: vi.fn() },
  })
}

describe('LoginForm passkeys', () => {
  beforeEach(() => {
    auth.signInWithPasskey.mockReset()
    enableWebAuthn()
    window.history.replaceState(null, '', '/login')
  })

  it('offers email-less passkey sign-in and explains a missing credential', async () => {
    auth.signInWithPasskey.mockResolvedValue({
      data: null,
      error: { code: 'webauthn_credential_not_found' },
    })
    render(<LoginForm />)

    const button = await screen.findByRole('button', { name: 'Continue with a passkey' })
    expect(button).toBeEnabled()
    fireEvent.click(button)

    await waitFor(() => expect(auth.signInWithPasskey).toHaveBeenCalledOnce())
    expect(await screen.findByRole('alert')).toHaveTextContent('No matching Nexez passkey was found on this device.')
  })

  it('does not show passkey sign-in during password recovery', () => {
    render(<LoginForm initialMode="reset" />)
    expect(screen.queryByRole('button', { name: 'Continue with a passkey' })).toBeNull()
  })
})
