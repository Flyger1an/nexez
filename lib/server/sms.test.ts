import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({
  createClient: vi.fn(),
  validateRequest: vi.fn(),
}))

vi.mock('twilio', () => {
  const factory = Object.assign(sdk.createClient, { validateRequest: sdk.validateRequest })
  return { default: factory, validateRequest: sdk.validateRequest }
})

import {
  buildSellerNegotiationSmsBody,
  checkSmsPhoneVerification,
  createTwilioClient,
  getTwilioConfigurationStatus,
  getTwilioStatusCallbackUrl,
  getTwilioWebhookUrl,
  isTwilioMessagingDeliveryReady,
  normalizeE164PhoneNumber,
  sendSellerNegotiationSms,
  startSmsPhoneVerification,
  validateTwilioWebhookSignature,
} from './sms'

const SID = {
  account: `AC${'a'.repeat(32)}`,
  apiKey: `SK${'b'.repeat(32)}`,
  messaging: `MG${'c'.repeat(32)}`,
  verify: `VA${'d'.repeat(32)}`,
}
const EVENT_ID = '11111111-1111-4111-8111-111111111111'

function configuredEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    TWILIO_ACCOUNT_SID: SID.account,
    TWILIO_API_KEY_SID: SID.apiKey,
    TWILIO_API_KEY_SECRET: 'restricted-api-key-secret',
    TWILIO_MESSAGING_SERVICE_SID: SID.messaging,
    TWILIO_VERIFY_SERVICE_SID: SID.verify,
    TWILIO_AUTH_TOKEN: 'webhook-auth-token',
    NEXT_PUBLIC_APP_URL: 'https://app.nexez.test',
    NEXT_PUBLIC_AGENT_RUNTIME_URL: 'https://nexez.app',
    ...overrides,
  } as unknown as NodeJS.ProcessEnv
}

function clientMock() {
  return {
    messages: { create: vi.fn() },
    verify: {
      v2: {
        services: vi.fn(),
      },
    },
  }
}

beforeEach(() => {
  sdk.createClient.mockReset()
  sdk.validateRequest.mockReset()
})

describe('E.164 validation', () => {
  it('accepts only a strict E.164 destination', () => {
    expect(normalizeE164PhoneNumber(' +14155552671 ')).toBe('+14155552671')
    expect(normalizeE164PhoneNumber('14155552671')).toBeNull()
    expect(normalizeE164PhoneNumber('+1 (415) 555-2671')).toBeNull()
    expect(normalizeE164PhoneNumber('+0123456789')).toBeNull()
    expect(normalizeE164PhoneNumber(`+1${'2'.repeat(15)}`)).toBeNull()
  })
})

describe('Twilio configuration', () => {
  it('reports configuration state without returning a credential', () => {
    expect(getTwilioConfigurationStatus(configuredEnv())).toEqual({
      apiCredentialsConfigured: true,
      messagingConfigured: true,
      verifyConfigured: true,
      webhookValidationConfigured: true,
      statusCallbackConfigured: true,
      inboundWebhookConfigured: true,
    })

    expect(getTwilioConfigurationStatus(configuredEnv({ TWILIO_MESSAGING_SERVICE_SID: '' })).messagingConfigured).toBe(false)
    expect(isTwilioMessagingDeliveryReady(configuredEnv())).toBe(true)
    expect(isTwilioMessagingDeliveryReady(configuredEnv({ TWILIO_AUTH_TOKEN: '' }))).toBe(false)
  })

  it('uses restricted API-key credentials to create an SDK client', () => {
    const client = clientMock()
    sdk.createClient.mockReturnValue(client)
    expect(createTwilioClient(configuredEnv())).toBe(client)
    expect(sdk.createClient).toHaveBeenCalledWith(SID.apiKey, 'restricted-api-key-secret', { accountSid: SID.account })
  })

  it('uses only the canonical runtime webhook paths and fails closed for overrides or another host', () => {
    const env = configuredEnv()
    expect(getTwilioStatusCallbackUrl(env)).toBe('https://nexez.app/api/webhooks/twilio/status')
    expect(getTwilioStatusCallbackUrl(env, EVENT_ID)).toBe(
      `https://nexez.app/api/webhooks/twilio/status?event=${EVENT_ID}`,
    )
    expect(getTwilioWebhookUrl('inbound', env)).toBe('https://nexez.app/api/webhooks/twilio/inbound')
    expect(getTwilioWebhookUrl('status', configuredEnv({ TWILIO_WEBHOOK_BASE_URL: 'https://hooks.nexez.test' }))).toBeNull()
    expect(getTwilioWebhookUrl('status', configuredEnv({ TWILIO_STATUS_CALLBACK_URL: 'https://nexez.app/api/webhooks/twilio/status' }))).toBeNull()
    expect(getTwilioWebhookUrl('inbound', configuredEnv({ TWILIO_INBOUND_WEBHOOK_URL: 'https://nexez.app/api/webhooks/twilio/inbound' }))).toBeNull()

    for (const runtimeOrigin of ['https://app.nexez.ai', 'https://nexez.ai', 'https://www.nexez.app', 'https://preview-nexez.vercel.app']) {
      const wrongHost = configuredEnv({ NEXT_PUBLIC_AGENT_RUNTIME_URL: runtimeOrigin })
      expect(getTwilioWebhookUrl('status', wrongHost), runtimeOrigin).toBeNull()
      expect(isTwilioMessagingDeliveryReady(wrongHost), runtimeOrigin).toBe(false)
    }
  })
})

describe('seller negotiation notification', () => {
  it('uses a Messaging Service, a status callback, and generic sign-in-only content', async () => {
    const env = configuredEnv()
    const client = clientMock()
    client.messages.create.mockResolvedValue({ sid: 'SM123', status: 'queued' })

    await expect(sendSellerNegotiationSms({ to: '+14155552671', eventId: EVENT_ID, env, client })).resolves.toEqual({
      ok: true,
      messageSid: 'SM123',
      status: 'queued',
    })

    expect(client.messages.create).toHaveBeenCalledWith({
      to: '+14155552671',
      body: buildSellerNegotiationSmsBody(env),
      messagingServiceSid: SID.messaging,
      statusCallback: `https://nexez.app/api/webhooks/twilio/status?event=${EVENT_ID}`,
      validityPeriod: 300,
    })
    const body = buildSellerNegotiationSmsBody(env)!
    expect(body).toContain('https://app.nexez.test/dashboard/negotiations')
    expect(body).toContain('Reply STOP to opt out.')
    expect(body).not.toMatch(/approval|token|accept|execute/i)
  })

  it('fails closed for an invalid recipient without invoking Twilio', async () => {
    const client = clientMock()
    await expect(sendSellerNegotiationSms({ to: '415-555-2671', eventId: EVENT_ID, env: configuredEnv(), client })).resolves.toEqual({
      ok: false,
      errorCode: 'invalid_phone_number',
    })
    expect(client.messages.create).not.toHaveBeenCalled()
  })
})

describe('Twilio Verify', () => {
  it('starts an SMS challenge and checks approval without exposing the code', async () => {
    const verificationCreate = vi.fn().mockResolvedValue({ sid: 'VE123', status: 'pending' })
    const verificationCheckCreate = vi.fn().mockResolvedValue({ sid: 'VE456', status: 'approved', valid: true })
    const services = vi.fn().mockReturnValue({
      verifications: { create: verificationCreate },
      verificationChecks: { create: verificationCheckCreate },
    })
    const client = clientMock()
    client.verify.v2.services = services
    const env = configuredEnv()

    await expect(startSmsPhoneVerification({ to: '+14155552671', env, client })).resolves.toEqual({
      ok: true,
      verificationSid: 'VE123',
      status: 'pending',
    })
    expect(services).toHaveBeenCalledWith(SID.verify)
    expect(verificationCreate).toHaveBeenCalledWith({ to: '+14155552671', channel: 'sms' })

    await expect(checkSmsPhoneVerification({ to: '+14155552671', code: ' 123456 ', env, client })).resolves.toEqual({
      ok: true,
      approved: true,
      verificationSid: 'VE456',
      status: 'approved',
    })
    expect(verificationCheckCreate).toHaveBeenCalledWith({ to: '+14155552671', code: '123456' })
  })
})

describe('webhook validation', () => {
  it('validates against the exact configured endpoint and never uses credentials for sending', () => {
    sdk.validateRequest.mockReturnValue(true)
    const env = configuredEnv()
    expect(
      validateTwilioWebhookSignature({
        kind: 'status',
        signature: 'signature',
        params: { MessageSid: 'SM123', MessageStatus: 'delivered' },
        statusEventId: EVENT_ID,
        env,
      }),
    ).toBe(true)
    expect(sdk.validateRequest).toHaveBeenCalledWith(
      'webhook-auth-token',
      'signature',
      `https://nexez.app/api/webhooks/twilio/status?event=${EVENT_ID}`,
      { MessageSid: 'SM123', MessageStatus: 'delivered' },
    )
  })

  it('fails closed when webhook validation is not configured', () => {
    expect(
      validateTwilioWebhookSignature({
        kind: 'inbound',
        signature: 'signature',
        params: {},
        env: configuredEnv({ TWILIO_AUTH_TOKEN: '' }),
      }),
    ).toBe(false)
    expect(sdk.validateRequest).not.toHaveBeenCalled()
  })
})
