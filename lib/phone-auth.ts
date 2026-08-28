// E.164 permits up to 15 digits. Nexez also rejects implausibly short values so
// every phone-auth surface uses the same 8 to 15 digit boundary.
const E164_PHONE_NUMBER = /^\+[1-9]\d{7,14}$/
const PHONE_OTP = /^\d{6,10}$/

/** Accept an E.164 number after removing benign surrounding whitespace. */
export function normalizeE164PhoneNumber(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return E164_PHONE_NUMBER.test(normalized) ? normalized : null
}

/** Convert Supabase Auth's digits-only storage form back to strict E.164. */
export function normalizeSupabaseAuthPhoneNumber(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalizeE164PhoneNumber(normalized.startsWith('+') ? normalized : `+${normalized}`)
}

export function isE164PhoneNumber(value: unknown): value is string {
  return typeof value === 'string' && E164_PHONE_NUMBER.test(value)
}

/** Supabase OTP length is configurable between 6 and 10 numeric digits. */
export function normalizePhoneOtp(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.replace(/\s+/g, '')
  return PHONE_OTP.test(normalized) ? normalized : null
}

/** Keep only the last four digits visible when a number is rendered in the UI. */
export function maskE164PhoneNumber(value: string | null | undefined): string | null {
  const normalized = normalizeE164PhoneNumber(value)
  if (!normalized) return null

  const digits = normalized.slice(1)
  return `+${'•'.repeat(digits.length - 4)}${digits.slice(-4)}`
}
