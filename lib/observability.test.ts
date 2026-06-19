import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { captureEvent, captureError, isObservabilityConfigured } from './observability'

describe('observability', () => {
  beforeEach(() => {
    delete process.env.OBSERVABILITY_WEBHOOK_URL
    delete process.env.OBSERVABILITY_WEBHOOK_TOKEN
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete process.env.OBSERVABILITY_WEBHOOK_URL
    delete process.env.OBSERVABILITY_WEBHOOK_TOKEN
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
})
