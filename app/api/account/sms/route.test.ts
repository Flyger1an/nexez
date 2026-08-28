import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '@/test/supabase-mock'

const {
  enforceRateLimit,
  hasSharedRateLimitBackend,
  resolveRequestAuth,
  createAdminClient,
  hasSupabaseAdminEnv,
  getTwilioConfigurationStatus,
  normalizeE164PhoneNumber,
  startSmsPhoneVerification,
  checkSmsPhoneVerification,
  suppressPendingSmsNotifications,
} = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  hasSharedRateLimitBackend: vi.fn(),
  resolveRequestAuth: vi.fn(),
  createAdminClient: vi.fn(),
  hasSupabaseAdminEnv: vi.fn(),
  getTwilioConfigurationStatus: vi.fn(),
  normalizeE164PhoneNumber: vi.fn(),
  startSmsPhoneVerification: vi.fn(),
  checkSmsPhoneVerification: vi.fn(),
  suppressPendingSmsNotifications: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit, hasSharedRateLimitBackend }))
vi.mock('@/lib/server/request-auth', () => ({ resolveRequestAuth }))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient, hasSupabaseAdminEnv }))
vi.mock('@/lib/server/sms', () => ({
  getTwilioConfigurationStatus,
  normalizeE164PhoneNumber,
  startSmsPhoneVerification,
  checkSmsPhoneVerification,
}))
vi.mock('@/lib/server/sms-notifications', () => ({ suppressPendingSmsNotifications }))

import { GET, POST } from './route'

const SELLER_ID = 'seller-1'
const PHONE = '+14155552671'
const CODE = '829145'
const FULL_TWILIO_CONFIG = {
  apiCredentialsConfigured: true,
  messagingConfigured: true,
  verifyConfigured: true,
  webhookValidationConfigured: true,
  statusCallbackConfigured: true,
  inboundWebhookConfigured: true,
}

type Destination = { phone_e164: string; verified_at: string | null } | null
type Subscription = { consented_at: string | null; opted_in_at: string | null; opted_out_at: string | null } | null

let queries: QueryContext[]
let rpcCalls: Array<{ name: string; args: Record<string, unknown> }>
let destination: Destination
let subscription: Subscription

function request(method: 'GET' | 'POST', body?: unknown) {
  return new Request('https://app.nexez.ai/api/account/sms', {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
  })
}

function configureAdmin() {
  const admin = createSupabaseMock((ctx) => {
    queries.push(ctx)

    if (ctx.table === 'user_sms_destinations') {
      if (ctx.op === 'select') return { data: destination, error: null }
      if (ctx.op === 'update') {
        destination = null
        return { data: null, error: null }
      }
    }

    if (ctx.table === 'sms_subscriptions') {
      if (ctx.op === 'select') return { data: subscription, error: null }
      if (ctx.op === 'update') {
        subscription = subscription ? { ...subscription, opted_out_at: String(ctx.payload?.opted_out_at || 'now') } : null
        return { data: null, error: null }
      }
    }

    return { data: null, error: null }
  }) as any

  admin.rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    rpcCalls.push({ name, args })
    if (name === 'activate_user_sms_destination') {
      destination = { phone_e164: String(args.p_phone_e164), verified_at: '2026-08-14T14:00:00.000Z' }
      subscription = {
        consented_at: String(args.p_consented_at),
        opted_in_at: '2026-08-14T14:00:00.000Z',
        opted_out_at: null,
      }
    }
    return { data: [{ destination_id: 'destination-1' }], error: null }
  })
  createAdminClient.mockReturnValue(admin)
}

beforeEach(() => {
  vi.clearAllMocks()
  queries = []
  rpcCalls = []
  destination = {
    phone_e164: PHONE,
    verified_at: '2026-08-14T12:00:00.000Z',
  }
  subscription = {
    consented_at: '2026-08-14T12:00:00.000Z',
    opted_in_at: '2026-08-14T12:00:00.000Z',
    opted_out_at: null,
  }
  enforceRateLimit.mockResolvedValue(null)
  hasSharedRateLimitBackend.mockReturnValue(true)
  suppressPendingSmsNotifications.mockResolvedValue(true)
  vi.stubEnv('NEXEZ_SMS_RATE_LIMIT_SECRET', 'a-very-long-random-rate-limit-secret-for-tests')
  resolveRequestAuth.mockResolvedValue({ supabase: {}, user: { id: SELLER_ID, email: 'seller@example.com' } })
  hasSupabaseAdminEnv.mockReturnValue(true)
  getTwilioConfigurationStatus.mockReturnValue(FULL_TWILIO_CONFIG)
  normalizeE164PhoneNumber.mockImplementation((value: string | null | undefined) => {
    if (typeof value !== 'string') return null
    const normalized = value.trim()
    return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null
  })
  startSmsPhoneVerification.mockResolvedValue({ ok: true, verificationSid: 'VE123', status: 'pending' })
  checkSmsPhoneVerification.mockResolvedValue({ ok: true, approved: true, verificationSid: 'VE123', status: 'approved' })
  configureAdmin()
})
afterEach(() => vi.unstubAllEnvs())

describe('GET /api/account/sms', () => {
  it('requires the current authenticated account', async () => {
    resolveRequestAuth.mockResolvedValue({ supabase: {}, user: null })

    const response = await GET(request('GET'))

    expect(response.status).toBe(401)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('returns only a masked active destination and account-owned consent state', async () => {
    const response = await GET(request('GET'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      available: true,
      verificationAvailable: true,
      messagingAvailable: true,
      enabled: true,
      destination: { phoneMasked: '••••2671', verifiedAt: '2026-08-14T12:00:00.000Z' },
      subscription: {
        consentedAt: '2026-08-14T12:00:00.000Z',
        optedInAt: '2026-08-14T12:00:00.000Z',
        optedOutAt: null,
      },
    })
    expect(JSON.stringify(body)).not.toContain(PHONE)
    expect(queries.find((query) => query.table === 'user_sms_destinations')?.calls).toContainEqual(['eq', 'user_id', SELLER_ID])
  })
})

describe('POST /api/account/sms', () => {
  it('requires explicit consent before it can ask Twilio to send a code', async () => {
    const response = await POST(request('POST', { action: 'start', phone: PHONE, consent: false }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatch(/valid request/i)
    expect(startSmsPhoneVerification).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(JSON.stringify(body)).not.toContain(PHONE)
  })

  it('starts Verify without persisting an unverified destination or subscription', async () => {
    destination = null
    subscription = null

    const response = await POST(request('POST', { action: 'start', phone: PHONE, consent: true }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(startSmsPhoneVerification).toHaveBeenCalledWith({ to: PHONE })
    expect(rpcCalls).toHaveLength(0)
    expect(queries.some((query) => query.op === 'insert' || query.op === 'update')).toBe(false)
    expect(body).toMatchObject({ enabled: false, destination: null, subscription: null })
    expect(JSON.stringify(body)).not.toContain(PHONE)
  })

  it('uses one opaque, shared per-phone bucket for Verify starts across accounts', async () => {
    destination = null
    subscription = null

    const first = await POST(request('POST', { action: 'start', phone: PHONE, consent: true }))
    resolveRequestAuth.mockResolvedValue({ supabase: {}, user: { id: 'seller-2', email: 'other@example.com' } })
    const second = await POST(request('POST', { action: 'start', phone: PHONE, consent: true }))

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    const phoneLimitCalls = enforceRateLimit.mock.calls.filter(([, route]) => route === 'account:sms:start:phone')
    expect(phoneLimitCalls).toHaveLength(2)

    const firstOptions = phoneLimitCalls[0]?.[4]
    const secondOptions = phoneLimitCalls[1]?.[4]
    expect(firstOptions).toMatchObject({ failClosed: true, requireShared: true })
    expect(secondOptions).toMatchObject({ failClosed: true, requireShared: true })
    expect(firstOptions?.subject).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(secondOptions?.subject).toBe(firstOptions?.subject)
    expect(firstOptions?.subject).not.toContain(PHONE)
    expect(secondOptions?.subject).not.toContain(PHONE)
    expect(JSON.stringify(phoneLimitCalls)).not.toContain(PHONE)
    expect(startSmsPhoneVerification).toHaveBeenCalledTimes(2)
  })

  it('never activates a destination until Twilio Verify approves the submitted code', async () => {
    checkSmsPhoneVerification.mockResolvedValue({ ok: true, approved: false, verificationSid: 'VE123', status: 'pending' })

    const response = await POST(request('POST', { action: 'verify', phone: PHONE, code: CODE }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatch(/not accepted/i)
    expect(checkSmsPhoneVerification).toHaveBeenCalledWith({ to: PHONE, code: CODE })
    expect(rpcCalls).toHaveLength(0)
    expect(queries.some((query) => query.op === 'insert' || query.op === 'update')).toBe(false)
    expect(JSON.stringify(body)).not.toContain(PHONE)
    expect(JSON.stringify(body)).not.toContain(CODE)
  })

  it('atomically activates the verified number and records account-settings consent after approval', async () => {
    destination = null
    subscription = null

    const response = await POST(request('POST', { action: 'verify', phone: PHONE, code: CODE }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0]).toMatchObject({
      name: 'activate_user_sms_destination',
      args: {
        p_user_id: SELLER_ID,
        p_phone_e164: PHONE,
        p_consent_version: '2026-08-transactional-sms-v1',
        p_consented_at: expect.any(String),
      },
    })
    expect(body).toMatchObject({
      enabled: true,
      destination: { phoneMasked: '••••2671' },
      subscription: { optedOutAt: null },
    })
    expect(JSON.stringify(body)).not.toContain(PHONE)
    expect(JSON.stringify(body)).not.toContain(CODE)
  })

  it('turns off the subscription before revoking the current account destination', async () => {
    const response = await POST(request('POST', { action: 'disable' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ enabled: false, destination: null })
    const subscriptionWrite = queries.find((query) => query.table === 'sms_subscriptions' && query.op === 'update')
    const destinationWrite = queries.find((query) => query.table === 'user_sms_destinations' && query.op === 'update')
    expect(subscriptionWrite?.payload).toMatchObject({ opted_out_at: expect.any(String) })
    expect(subscriptionWrite?.calls).toContainEqual(['eq', 'user_id', SELLER_ID])
    expect(subscriptionWrite?.calls).toContainEqual(['eq', 'topic', 'seller_negotiation'])
    expect(destinationWrite?.payload).toMatchObject({ revoked_at: expect.any(String) })
    expect(destinationWrite?.calls).toContainEqual(['eq', 'user_id', SELLER_ID])
    expect(destinationWrite?.calls).toContainEqual(['is', 'revoked_at', null])
    expect(JSON.stringify(body)).not.toContain(PHONE)
  })

  it('requires the complete sender, Verify, and webhook configuration before a verification can start', async () => {
    getTwilioConfigurationStatus.mockReturnValue({ ...FULL_TWILIO_CONFIG, inboundWebhookConfigured: false })

    const response = await POST(request('POST', { action: 'start', phone: PHONE, consent: true }))
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(startSmsPhoneVerification).not.toHaveBeenCalled()
    expect(JSON.stringify(body)).not.toContain(PHONE)
  })

  it('does not expose a Twilio error code, phone number, or verification code when starting fails', async () => {
    startSmsPhoneVerification.mockResolvedValue({ ok: false, errorCode: 'twilio_30007' })

    const response = await POST(request('POST', { action: 'start', phone: PHONE, consent: true }))
    const body = await response.json()
    const serialized = JSON.stringify(body)

    expect(response.status).toBe(502)
    expect(serialized).toContain('Could not send a verification code')
    expect(serialized).not.toContain('twilio_30007')
    expect(serialized).not.toContain(PHONE)
    expect(serialized).not.toContain(CODE)
  })
})
