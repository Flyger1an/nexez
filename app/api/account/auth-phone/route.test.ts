import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refs = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  hasSharedRateLimitBackend: vi.fn(),
  resolveRequestAuth: vi.fn(),
  getTwilioConfigurationStatus: vi.fn(),
  startSmsPhoneVerification: vi.fn(),
  checkSmsPhoneVerification: vi.fn(),
  createAdminClient: vi.fn(),
  hasSupabaseAdminEnv: vi.fn(),
  getUserById: vi.fn(),
  updateUserById: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: refs.enforceRateLimit,
  hasSharedRateLimitBackend: refs.hasSharedRateLimitBackend,
}))
vi.mock('@/lib/server/request-auth', () => ({ resolveRequestAuth: refs.resolveRequestAuth }))
vi.mock('@/lib/server/sms', () => ({
  getTwilioConfigurationStatus: refs.getTwilioConfigurationStatus,
  startSmsPhoneVerification: refs.startSmsPhoneVerification,
  checkSmsPhoneVerification: refs.checkSmsPhoneVerification,
}))
vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: refs.createAdminClient,
  hasSupabaseAdminEnv: refs.hasSupabaseAdminEnv,
}))

import { GET, POST } from './route'

const USER_ID = '36c50eb6-b36a-40de-ae25-a13cecf66d84'
const PHONE = '+14155550123'
const STORED_PHONE = '14155550123'
const CODE = '123456'

function request(body: unknown) {
  return new Request('https://app.nexez.ai/api/account/auth-phone', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function getRequest() {
  return new Request('https://app.nexez.ai/api/account/auth-phone')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXEZ_SMS_RATE_LIMIT_SECRET', 'a-very-long-random-rate-limit-secret-for-tests')
  refs.enforceRateLimit.mockResolvedValue(null)
  refs.hasSharedRateLimitBackend.mockReturnValue(true)
  refs.resolveRequestAuth.mockResolvedValue({ user: { id: USER_ID }, supabase: {} })
  refs.getTwilioConfigurationStatus.mockReturnValue({
    apiCredentialsConfigured: true,
    messagingConfigured: true,
    verifyConfigured: true,
    webhookValidationConfigured: true,
    statusCallbackConfigured: true,
    inboundWebhookConfigured: true,
  })
  refs.hasSupabaseAdminEnv.mockReturnValue(true)
  refs.startSmsPhoneVerification.mockResolvedValue({ ok: true, verificationSid: 'VE123', status: 'pending' })
  refs.checkSmsPhoneVerification.mockResolvedValue({ ok: true, approved: true, verificationSid: 'VE123', status: 'approved' })
  refs.getUserById.mockResolvedValue({
    data: { user: { id: USER_ID, phone: STORED_PHONE, phone_confirmed_at: '2026-08-28T00:00:00.000Z' } },
    error: null,
  })
  refs.updateUserById.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
  refs.createAdminClient.mockReturnValue({
    auth: { admin: { getUserById: refs.getUserById, updateUserById: refs.updateUserById } },
  })
})

afterEach(() => vi.unstubAllEnvs())

describe('GET /api/account/auth-phone', () => {
  it('returns only the masked confirmed phone for the authenticated account', async () => {
    const response = await GET(getRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(refs.getUserById).toHaveBeenCalledWith(USER_ID)
    expect(body).toEqual({ phoneMasked: '+•••••••0123' })
    expect(JSON.stringify(body)).not.toContain(PHONE)
    expect(JSON.stringify(body)).not.toContain(STORED_PHONE)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('returns no phone when the stored number is not confirmed', async () => {
    refs.getUserById.mockResolvedValue({
      data: { user: { id: USER_ID, phone: PHONE, phone_confirmed_at: null } },
      error: null,
    })

    const response = await GET(getRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ phoneMasked: null })
  })

  it('requires an authenticated account without reading Auth admin state', async () => {
    refs.resolveRequestAuth.mockResolvedValue({ user: null, supabase: {} })

    const response = await GET(getRequest())

    expect(response.status).toBe(401)
    expect(refs.getUserById).not.toHaveBeenCalled()
  })
})

describe('POST /api/account/auth-phone', () => {
  it('requires an authenticated account', async () => {
    refs.resolveRequestAuth.mockResolvedValue({ user: null, supabase: {} })

    const response = await POST(request({ action: 'start', phone: PHONE }))

    expect(response.status).toBe(401)
    expect(refs.startSmsPhoneVerification).not.toHaveBeenCalled()
  })

  it('starts a rate-limited verification without returning the full number', async () => {
    const response = await POST(request({ action: 'start', phone: PHONE }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(refs.startSmsPhoneVerification).toHaveBeenCalledWith({ to: PHONE })
    expect(body).toEqual({ sent: true, phoneMasked: '+•••••••0123' })
    expect(JSON.stringify(body)).not.toContain(PHONE)

    const phoneLimit = refs.enforceRateLimit.mock.calls.find(([, route]) => route === 'account:auth-phone:start:phone')
    expect(phoneLimit?.[4]).toMatchObject({ failClosed: true, requireShared: true })
    expect(phoneLimit?.[4]?.subject).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(phoneLimit?.[4]?.subject).not.toContain(PHONE)
  })

  it('does not mutate Auth until Twilio approves the submitted code', async () => {
    refs.checkSmsPhoneVerification.mockResolvedValue({
      ok: true,
      approved: false,
      verificationSid: 'VE123',
      status: 'pending',
    })

    const response = await POST(request({ action: 'verify', phone: PHONE, code: CODE }))

    expect(response.status).toBe(400)
    expect(refs.checkSmsPhoneVerification).toHaveBeenCalledWith({ to: PHONE, code: CODE })
    expect(refs.updateUserById).not.toHaveBeenCalled()
  })

  it('links and confirms the phone on the current Auth user after approval', async () => {
    const response = await POST(request({ action: 'verify', phone: PHONE, code: CODE }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(refs.updateUserById).toHaveBeenCalledWith(USER_ID, { phone: PHONE, phone_confirm: true })
    expect(body).toEqual({ verified: true, phoneMasked: '+•••••••0123' })
    expect(JSON.stringify(body)).not.toContain(PHONE)
    expect(JSON.stringify(body)).not.toContain(CODE)
  })

  it('keeps account conflicts and provider details private', async () => {
    refs.updateUserById.mockResolvedValue({ data: { user: null }, error: { message: 'A user with this phone already exists' } })

    const response = await POST(request({ action: 'verify', phone: PHONE, code: CODE }))
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toBe('We could not verify and link that phone number.')
    expect(JSON.stringify(body)).not.toContain(PHONE)
    expect(JSON.stringify(body)).not.toContain('already exists')
  })

  it('rejects malformed numbers and codes before calling Twilio', async () => {
    const response = await POST(request({ action: 'verify', phone: '(762) 744-5455', code: '12345a' }))

    expect(response.status).toBe(400)
    expect(refs.checkSmsPhoneVerification).not.toHaveBeenCalled()
  })
})
