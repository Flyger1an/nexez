import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { captureEvent, captureError, isObservabilityConfigured } from './observability'

describe('observability', () => {
  beforeEach(() => {
    delete process.env.OBSERVABILITY_WEBHOOK_URL
    delete process.env.OBSERVABILITY_WEBHOOK_TOKEN
    delete process.env.SENTRY_DSN
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete process.env.OBSERVABILITY_WEBHOOK_URL
    delete process.env.OBSERVABILITY_WEBHOOK_TOKEN
    delete process.env.SENTRY_DSN
  })

  it('isObservabilityConfigured reflects the webhook env', () => {
    expect(isObservabilityConfigured()).toBe(false)
    process.env.OBSERVABILITY_WEBHOOK_URL = 'https://sink.example/ingest'
    expect(isObservabilityConfigured()).toBe(true)
  })

  it('captureEvent logs locally but does not POST without a webhook', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    captureEvent('nexie.turn', { latencyMs: 12, fellBack: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('captureEvent POSTs an info-level event (with bearer token) when configured', () => {
    process.env.OBSERVABILITY_WEBHOOK_URL = 'https://sink.example/ingest'
    process.env.OBSERVABILITY_WEBHOOK_TOKEN = 'tok'
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    captureEvent('nexie.action', { tool: 'trigger_booking', ok: true, latencyMs: 80 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://sink.example/ingest')
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(JSON.parse(opts.body as string)).toMatchObject({
      service: 'nexez',
      level: 'info',
      event: 'nexie.action',
      context: { tool: 'trigger_booking', ok: true },
    })
  })

  it('captureError POSTs an error event and never throws even if the sink rejects', () => {
    process.env.OBSERVABILITY_WEBHOOK_URL = 'https://sink.example/ingest'
    const fetchMock = vi.fn(async () => {
      throw new Error('sink down')
    })
    vi.stubGlobal('fetch', fetchMock)

    expect(() => captureError(new Error('boom'), { scope: 'nexie.llm_turn' })).not.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // The Sentry fan-out. These assert the two sinks are genuinely independent,
  // which is the property an early return in captureError would quietly break.
  it('captureError reaches Sentry even when no webhook is configured', () => {
    process.env.SENTRY_DSN = 'https://key@o1.ingest.us.sentry.io/2'
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    captureError(new Error('boom'), { scope: 'nexie.llm_turn' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('https://o1.ingest.us.sentry.io/api/2/envelope/')
  })

  it('captureError reaches both sinks when both are configured', () => {
    process.env.OBSERVABILITY_WEBHOOK_URL = 'https://sink.example/ingest'
    process.env.SENTRY_DSN = 'https://key@o1.ingest.us.sentry.io/2'
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    captureError(new Error('boom'), { scope: 'nexie.llm_turn' })

    const targets = fetchMock.mock.calls.map((call) => (call as unknown as [string])[0])
    expect(targets).toHaveLength(2)
    expect(targets).toContain('https://sink.example/ingest')
    expect(targets).toContain('https://o1.ingest.us.sentry.io/api/2/envelope/')
  })

  it('captureEvent does NOT go to Sentry (info telemetry would burn error quota)', () => {
    process.env.SENTRY_DSN = 'https://key@o1.ingest.us.sentry.io/2'
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    captureEvent('nexie.turn', { latencyMs: 12 })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('behaves exactly as before when SENTRY_DSN is unset', () => {
    process.env.OBSERVABILITY_WEBHOOK_URL = 'https://sink.example/ingest'
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    captureError(new Error('boom'), { scope: 'nexie.llm_turn' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('https://sink.example/ingest')
  })
})
