import { describe, expect, it } from 'vitest'
import {
  isE164PhoneNumber,
  maskE164PhoneNumber,
  normalizeE164PhoneNumber,
  normalizePhoneOtp,
  normalizeSupabaseAuthPhoneNumber,
} from './phone-auth'

describe('phone auth helpers', () => {
  it('normalizes valid E.164 numbers and rejects ambiguous formats', () => {
    expect(normalizeE164PhoneNumber('  +17627445455  ')).toBe('+17627445455')
    expect(normalizeE164PhoneNumber('(762) 744-5455')).toBeNull()
    expect(normalizeE164PhoneNumber('+0123456789')).toBeNull()
    expect(isE164PhoneNumber('+17627445455')).toBe(true)
    expect(isE164PhoneNumber('17627445455')).toBe(false)
  })

  it('accepts configurable numeric OTP lengths while ignoring spaces', () => {
    expect(normalizePhoneOtp('123 456')).toBe('123456')
    expect(normalizePhoneOtp('1234567890')).toBe('1234567890')
    expect(normalizePhoneOtp('12345')).toBeNull()
    expect(normalizePhoneOtp('12345a')).toBeNull()
  })

  it('restores Supabase Auth phone storage to strict E.164', () => {
    expect(normalizeSupabaseAuthPhoneNumber('17627445455')).toBe('+17627445455')
    expect(normalizeSupabaseAuthPhoneNumber('+17627445455')).toBe('+17627445455')
    expect(normalizeSupabaseAuthPhoneNumber('invalid')).toBeNull()
  })

  it('masks all but the last four phone digits', () => {
    expect(maskE164PhoneNumber('+17627445455')).toBe('+•••••••5455')
    expect(maskE164PhoneNumber('invalid')).toBeNull()
  })
})
