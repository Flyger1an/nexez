type PasskeyErrorLike = {
  code?: unknown
  message?: unknown
  name?: unknown
}

export function browserSupportsPasskeys() {
  return Boolean(
    typeof window !== 'undefined' &&
      'PublicKeyCredential' in window &&
      window.PublicKeyCredential &&
      'credentials' in navigator &&
      typeof navigator.credentials?.create === 'function' &&
      typeof navigator.credentials?.get === 'function',
  )
}

export function passkeyErrorMessage(error: unknown, fallback: string) {
  const authError = (error && typeof error === 'object' ? error : {}) as PasskeyErrorLike
  const code = typeof authError.code === 'string' ? authError.code : ''
  const name = typeof authError.name === 'string' ? authError.name : ''
  const message = typeof authError.message === 'string' ? authError.message : ''

  if (name === 'NotAllowedError' || /not allowed|cancel(?:ed|led)|timed out/i.test(message)) {
    return 'The passkey prompt was canceled or timed out.'
  }

  if (/does not support WebAuthn/i.test(message)) {
    return 'This browser or device does not support passkeys.'
  }

  switch (code) {
    case 'passkey_disabled':
      return 'Passkey authentication is not available right now.'
    case 'too_many_passkeys':
      return 'This account has reached its passkey limit. Remove an old passkey and try again.'
    case 'webauthn_credential_exists':
      return 'This passkey is already registered to your account.'
    case 'webauthn_credential_not_found':
      return 'No matching Nexez passkey was found on this device.'
    case 'webauthn_challenge_expired':
      return 'The passkey prompt expired. Please try again.'
    case 'webauthn_verification_failed':
      return 'Nexez could not verify that passkey. Please try again or use another sign-in method.'
    case 'email_not_confirmed':
    case 'phone_not_confirmed':
      return 'Confirm your account before using a passkey.'
    default:
      return message || fallback
  }
}
