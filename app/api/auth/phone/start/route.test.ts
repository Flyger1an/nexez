import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refs = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  hasSharedRateLimitBackend: vi.fn(),
  signInWithOtp: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  hasSupabaseAdminEnv: vi.fn(),
  maybeSingle: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: refs.enforceRateLimit,
  hasSharedRateLimitBackend: refs.hasSharedRateLimitBackend,
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: refs.createClient }))
vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: refs.createAdminClient,
  hasSupabaseAdminEnv: refs.hasSupabaseAdminEnv,
}))

import { POST } from './route'

const EMAIL = 'person@example.com'
const PHONE = '+442071838750'
const USER_ID = '3d62674e-a8b2-4d2a-9f99-d4a2b4589143'

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
  refs.hasSupabaseAdminEnv.mockReturnValue(true)
  refs.signInWithOtp.mockResolvedValue({ data: {}, error: null })
  refs.createClient.mockReturnValue({ auth: { signInWithOtp: refs.signInWithOtp } })
  refs.maybeSingle.mockResolvedValue({
    data: { user_id: USER_ID, phone_e164: PHONE },
    error: null,
  })
  refs.createAdminClient.mockReturnValue({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: refs.maybeSingle }),
      }),
    }),
  })
})

afterEach(() => vi.unstubAllEnvs())

describe('POST /api/auth/phone/start', () => {
  it('resolves a verified phone by normalized email and sends an existing-account OTP', async () => {
    const response = await POST(request({ email: ' Person@Example.com ' }))
    const body = await response.json()

    expect(response.status).toBe(202)
    expect(body).toMatchObject({ sent: true, challenge: expect.stringMatching(/^v1\./) })
    expect(JSON.stringify(body)).not.toContain(EMAIL)
    expect(JSON.stringify(body)).not.toContain(PHONE)
    expect(refs.signInWithOtp).toHaveBeenCalledWith({
      phone: PHONE,
      options: { channel: 'sms', shouldCreateUser: false },
    })
  })

  it('uses fail-closed shared IP and opaque email limits', async () => {
    await POST(request({ email: EMAIL }))

    expect(refs.enforceRateLimit).toHaveBeenNthCalledWith(1, expect.any(Request), 'auth:phone:start:ip', 10, 600_000, {
      failClosed: true,
      requireShared: true,
    })
    const emailLimit = refs.enforceRateLimit.mock.calls.find(([, route]) => route === 'auth:phone:start:email')
    expect(emailLimit?.[4]).toMatchObject({ failClosed: true, requireShared: true })
    expect(emailLimit?.[4]?.subject).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(emailLimit?.[4]?.subject).not.toContain(EMAIL)
  })

  it('returns the same accepted response shape for an unknown email without sending an OTP', async () => {
    refs.maybeSingle.mockResolvedValue({ data: null, error: null })

    const response = await POST(request({ email: 'unknown@example.com' }))
    const body = await response.json()

    expect(response.status).toBe(202)
    expect(body).toMatchObject({ sent: true, challenge: expect.stringMatching(/^v1\./) })
    expect(refs.createClient).not.toHaveBeenCalled()
    expect(refs.signInWithOtp).not.toHaveBeenCalled()
  })

  it('rejects malformed payloads before looking up an account', async () => {
    const response = await POST(request({ email: 'not-an-email', phone: PHONE }))

    expect(response.status).toBe(400)
    expect(refs.createAdminClient).not.toHaveBeenCalled()
  })

  it('fails closed when the shared limiter is unavailable', async () => {
    refs.hasSharedRateLimitBackend.mockReturnValue(false)

    const response = await POST(request({ email: EMAIL }))

    expect(response.status).toBe(503)
    expect(refs.createAdminClient).not.toHaveBeenCalled()
  })

  it('keeps provider rejection details out of the accepted response', async () => {
    refs.signInWithOtp.mockResolvedValue({
      data: {},
      error: { code: 'otp_disabled', status: 400, message: 'Signups not allowed for otp' },
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const response = await POST(request({ email: EMAIL }))
    const body = await response.json()

    expect(response.status).toBe(202)
    expect(body.sent).toBe(true)
    expect(JSON.stringify(body)).not.toContain(PHONE)
    expect(JSON.stringify(body)).not.toContain('Signups not allowed')
    warn.mockRestore()
  })
})
