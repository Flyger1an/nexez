// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../test/dom'
import { PhoneLoginForm } from './PhoneLoginForm'

const EMAIL = 'person@example.com'
const CHALLENGE = 'v1.opaque-challenge'

function openPhoneLogin() {
  const onAuthenticated = vi.fn()
  render(<PhoneLoginForm onAuthenticated={onAuthenticated} />)
  fireEvent.click(screen.getByRole('button', { name: 'Continue with a text code' }))
  return onAuthenticated
}

describe('PhoneLoginForm', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(
      JSON.stringify({ sent: true, challenge: CHALLENGE }),
      { status: 202 },
    ))))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('does not send malformed email addresses', async () => {
    openPhoneLogin()
    fireEvent.change(screen.getByRole('textbox', { name: 'Account email' }), { target: { value: 'person@example' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in code' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('email address attached')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('starts SMS login with the normalized account email without asking for a phone', async () => {
    openPhoneLogin()
    expect(screen.queryByRole('textbox', { name: 'Login phone' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Account email' }), { target: { value: ' Person@Example.com ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in code' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    expect(fetch).toHaveBeenCalledWith('/api/auth/phone/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL }),
    })
    expect(await screen.findByRole('textbox', { name: 'Verification code' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('If this email has a verified login phone')
  })

  it('submits the opaque challenge and code to the server, then completes authentication', async () => {
    const onAuthenticated = openPhoneLogin()
    fireEvent.change(screen.getByRole('textbox', { name: 'Account email' }), { target: { value: EMAIL } })
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in code' }))

    const code = await screen.findByRole('textbox', { name: 'Verification code' })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ verified: true }), { status: 200 }))
    fireEvent.change(code, { target: { value: '123 456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/auth/phone/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challenge: CHALLENGE, code: '123456' }),
    })
    expect(onAuthenticated).toHaveBeenCalledOnce()
  })

  it('does not expose server or provider details', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: 'provider detail' }), { status: 503 }))
    openPhoneLogin()
    fireEvent.change(screen.getByRole('textbox', { name: 'Account email' }), { target: { value: EMAIL } })
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in code' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('could not start text sign-in')
    expect(alert).not.toHaveTextContent('provider detail')
  })
})
