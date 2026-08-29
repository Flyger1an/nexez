import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSmsLoginChallenge } from '@/lib/server/sms-login-challenge'

const refs = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  hasSharedRateLimitBackend: vi.fn(),
  cookies: vi.fn(),
  createClient: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: refs.enforceRateLimit,
  hasSharedRateLimitBackend: refs.hasSharedRateLimitBackend,
}))
vi.mock('next/headers', () => ({ cookies: refs.cookies }))
vi.mock('@/utils/supabase/server', () => ({ createClient: refs.createClient }))

import { POST } from './route'

const ACCOUNT = {
  userId: '3d62674e-a8b2-4d2a-9f99-d4a2b4589143',
  phone: '+442071838750',
}

function request(body: unknown) {
  return new Request('https://app.nexez.ai/api/auth/phone/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXEZ_SMS_RATE_LIMIT_SECRET', 'a-very-long-random-rate-limit-secret-for-tests')
  refs.enforceRateLimit.mockResolvedValue(null)
  refs.hasSharedRateLimitBackend.mockReturnValue(true)
  refs.cookies.mockResolvedValue({ cookieStore: true })
  refs.verifyOtp.mockResolvedValue({
    data: { user: { id: ACCOUNT.userId }, session: { access_token: 'session' } },
    error: null,
  })
  refs.signOut.mockResolvedValue({ error: null })
  refs.createClient.mockReturnValue({ auth: { verifyOtp: refs.verifyOtp, signOut: refs.signOut } })
})

afterEach(() => vi.unstubAllEnvs())

describe('POST /api/auth/phone/verify', () => {
  it('verifies the bound phone server-side and creates the cookie-backed session', async () => {
    const challenge = createSmsLoginChallenge(ACCOUNT)!
    const response = await POST(request({ challenge, code: '123 456' }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ verified: true })
    expect(refs.createClient).toHaveBeenCalledWith({ cookieStore: true }, 'app.nexez.ai')
    expect(refs.verifyOtp).toHaveBeenCalledWith({ phone: ACCOUNT.phone, token: '123456', type: 'sms' })
  })

  it('rate-limits attempts by an opaque challenge hash', async () => {
    const challenge = createSmsLoginChallenge(ACCOUNT)!
    await POST(request({ challenge, code: '123456' }))

    const challengeLimit = refs.enforceRateLimit.mock.calls.find(([, route]) => route === 'auth:phone:verify:challenge')
    expect(challengeLimit?.[4]).toMatchObject({ failClosed: true, requireShared: true })
    expect(challengeLimit?.[4]?.subject).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(challengeLimit?.[4]?.subject).not.toContain(ACCOUNT.phone)
  })

  it('rejects dummy and tampered challenges without calling Supabase', async () => {
    const dummy = createSmsLoginChallenge(null)!

    expect((await POST(request({ challenge: dummy, code: '123456' }))).status).toBe(400)
    expect((await POST(request({ challenge: `${dummy}x`, code: '123456' }))).status).toBe(400)
    expect(refs.verifyOtp).not.toHaveBeenCalled()
  })

  it('signs out and rejects a session that does not match the challenged account', async () => {
    refs.verifyOtp.mockResolvedValue({
      data: { user: { id: '84ab5fcf-4b23-4f84-bf0e-c81bddb5941a' }, session: { access_token: 'wrong' } },
      error: null,
    })
    const challenge = createSmsLoginChallenge(ACCOUNT)!

    const response = await POST(request({ challenge, code: '123456' }))

    expect(response.status).toBe(400)
    expect(refs.signOut).toHaveBeenCalledOnce()
  })

  it('keeps provider errors generic', async () => {
    refs.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'provider detail' },
    })
    const challenge = createSmsLoginChallenge(ACCOUNT)!

    const response = await POST(request({ challenge, code: '123456' }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(JSON.stringify(body)).not.toContain('provider detail')
    expect(JSON.stringify(body)).not.toContain(ACCOUNT.phone)
  })
})
