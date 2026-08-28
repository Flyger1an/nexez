// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../test/dom'
import { PhoneLoginForm } from './PhoneLoginForm'

const { auth } = vi.hoisted(() => ({
  auth: {
    verifyOtp: vi.fn(),
  },
}))

vi.mock('../utils/supabase/client', () => ({ createClient: () => ({ auth }) }))

const PHONE = '+17627445455'

function openPhoneLogin() {
  const onAuthenticated = vi.fn()
  render(<PhoneLoginForm onAuthenticated={onAuthenticated} />)
  fireEvent.click(screen.getByRole('button', { name: 'Continue with phone' }))
  return onAuthenticated
}

describe('PhoneLoginForm', () => {
  beforeEach(() => {
    auth.verifyOtp.mockReset()
    auth.verifyOtp.mockResolvedValue({ data: {}, error: null })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ sent: true }), { status: 202 }))))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('does not send malformed phone numbers', async () => {
    openPhoneLogin()
    fireEvent.change(screen.getByRole('textbox', { name: 'Login phone' }), { target: { value: '(762) 744-5455' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in code' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('international format')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends an SMS only for an existing account', async () => {
    openPhoneLogin()
    fireEvent.change(screen.getByRole('textbox', { name: 'Login phone' }), { target: { value: PHONE } })
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in code' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    expect(fetch).toHaveBeenCalledWith('/api/auth/phone/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: PHONE }),
    })
    expect(await screen.findByRole('textbox', { name: 'Verification code' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('If this number is linked')
  })

  it('verifies the SMS code and completes authentication', async () => {
    const onAuthenticated = openPhoneLogin()
    fireEvent.change(screen.getByRole('textbox', { name: 'Login phone' }), { target: { value: PHONE } })
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in code' }))

    const code = await screen.findByRole('textbox', { name: 'Verification code' })
    fireEvent.change(code, { target: { value: '123 456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }))

    await waitFor(() => expect(auth.verifyOtp).toHaveBeenCalledOnce())
    expect(auth.verifyOtp).toHaveBeenCalledWith({ phone: PHONE, token: '123456', type: 'sms' })
    expect(onAuthenticated).toHaveBeenCalledOnce()
  })

  it('does not expose whether an unlinked account exists', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: 'provider detail' }), { status: 503 }))
    openPhoneLogin()
    fireEvent.change(screen.getByRole('textbox', { name: 'Login phone' }), { target: { value: PHONE } })
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in code' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Confirm this number is linked to your Nexez account')
    expect(alert).not.toHaveTextContent('provider detail')
  })
})
