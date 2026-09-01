// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '../test/dom'
import { SMS_CONSENT_CORE_COPY, SMS_PRIVACY_NON_SHARING_COPY } from '../lib/sms-consent'
import { SmsNotificationSettings } from './SmsNotificationSettings'

function response(body: object) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }))
}

describe('SmsNotificationSettings', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => response({
      available: true,
      verificationAvailable: true,
      messagingAvailable: true,
      enabled: false,
      destination: null,
      subscription: null,
    })))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('shows the optional phone field and complete consent together', async () => {
    render(<SmsNotificationSettings />)

    expect(await screen.findByRole('textbox', { name: 'Mobile number (optional)' })).toBeInTheDocument()
    expect(screen.getByText(/Leave this blank to keep using email and dashboard notifications only/)).toBeInTheDocument()
    expect(screen.getByText(SMS_CONSENT_CORE_COPY, { exact: false })).toBeInTheDocument()
    expect(screen.getByText(SMS_PRIVACY_NON_SHARING_COPY)).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Send verification code' })).toBeDisabled()
  })
})
