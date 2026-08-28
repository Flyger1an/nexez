import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refs = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  hasSharedRateLimitBackend: vi.fn(),
  signInWithOtp: vi.fn(),
  createClient: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: refs.enforceRateLimit,
  hasSharedRateLimitBackend: refs.hasSharedRateLimitBackend,
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: refs.createClient }))

import { POST } from './route'

const PHONE = '+17627445455'

function request(body: unknown) {
  return new Request('https://app.nexez.ai/api/auth/phone/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXEZ_SMS_RATE_LIMIT_SECRET', 'a-very-long-random-rate-limit-secret-for-tests')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
  refs.enforceRateLimit.mockResolvedValue(null)
  refs.hasSharedRateLimitBackend.mockReturnValue(true)
  refs.signInWithOtp.mockResolvedValue({ data: {}, error: null })
  refs.createClient.mockReturnValue({ auth: { signInWithOtp: refs.signInWithOtp } })
})

afterEach(() => vi.unstubAllEnvs())

describe('POST /api/auth/phone/start', () => {
  it('sends only existing-account OTPs through Supabase', async () => {
    const response = await POST(request({ phone: PHONE }))

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ sent: true })
    expect(refs.signInWithOtp).toHaveBeenCalledWith({
      phone: PHONE,
      options: { channel: 'sms', shouldCreateUser: false },
    })
  })

  it('uses fail-closed shared IP and opaque phone limits', async () => {
    await POST(request({ phone: PHONE }))

    expect(refs.enforceRateLimit).toHaveBeenNthCalledWith(1, expect.any(Request), 'auth:phone:start:ip', 10, 600_000, {
      failClosed: true,
      requireShared: true,
    })
    const phoneLimit = refs.enforceRateLimit.mock.calls.find(([, route]) => route === 'auth:phone:start:number')
    expect(phoneLimit?.[4]).toMatchObject({ failClosed: true, requireShared: true })
    expect(phoneLimit?.[4]?.subject).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(phoneLimit?.[4]?.subject).not.toContain(PHONE)
  })

  it('rejects malformed payloads before contacting Supabase', async () => {
    const response = await POST(request({ phone: '(762) 744-5455', shouldCreateUser: true }))

    expect(response.status).toBe(400)
    expect(refs.createClient).not.toHaveBeenCalled()
  })

  it('fails closed when the shared limiter is unavailable', async () => {
    refs.hasSharedRateLimitBackend.mockReturnValue(false)

    const response = await POST(request({ phone: PHONE }))

    expect(response.status).toBe(503)
    expect(refs.createClient).not.toHaveBeenCalled()
  })

  it('returns the same accepted response when Supabase rejects an unlinked number', async () => {
    refs.signInWithOtp.mockResolvedValue({
      data: {},
      error: { code: 'otp_disabled', status: 400, message: 'Signups not allowed for otp' },
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const response = await POST(request({ phone: PHONE }))
    const body = await response.json()

    expect(response.status).toBe(202)
    expect(body).toEqual({ sent: true })
    expect(JSON.stringify(body)).not.toContain(PHONE)
    expect(JSON.stringify(body)).not.toContain('Signups not allowed')
    warn.mockRestore()
  })
})
