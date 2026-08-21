import { describe, expect, it } from 'vitest'
import { browserSupportsPasskeys, passkeyErrorMessage } from './passkeys'

describe('passkey helpers', () => {
  it('reports unsupported browsers outside a browser runtime', () => {
    expect(browserSupportsPasskeys()).toBe(false)
  })

  it('turns WebAuthn cancellation into clear user-facing copy', () => {
    expect(passkeyErrorMessage({ name: 'NotAllowedError' }, 'fallback')).toBe(
      'The passkey prompt was canceled or timed out.',
    )
  })

  it('maps Supabase passkey errors and preserves unknown messages', () => {
    expect(passkeyErrorMessage({ code: 'webauthn_credential_not_found' }, 'fallback')).toBe(
      'No matching Nexez passkey was found on this device.',
    )
    expect(passkeyErrorMessage({ message: 'Provider rejected this request.' }, 'fallback')).toBe(
      'Provider rejected this request.',
    )
  })
})
