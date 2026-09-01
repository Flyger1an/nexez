import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isSentryConfigured, sendErrorToSentry, sendSignalToSentry } from './sentry-transport'

const DSN = 'https://abc123def456@o4509.ingest.us.sentry.io/4510'

/** The envelope is newline-delimited JSON: header, item header, payload. */
function parseEnvelope(body: string) {
  const [header, itemHeader, payload] = body.split('\n')
  return {
    header: JSON.parse(header!),
    itemHeader: JSON.parse(itemHeader!),
    event: JSON.parse(payload!),
  }
}

describe('sentry transport', () => {
  beforeEach(() => {
    delete process.env.SENTRY_DSN
    delete process.env.VERCEL_TARGET_ENV
    delete process.env.VERCEL_ENV
    delete process.env.VERCEL_GIT_COMMIT_SHA
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete process.env.SENTRY_DSN
  })

  it('is dormant when SENTRY_DSN is unset', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(isSentryConfigured()).toBe(false)
    sendErrorToSentry(new Error('boom'), { scope: 'test' })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stays dormant, and warns, on a malformed DSN rather than throwing', () => {
    process.env.SENTRY_DSN = 'not-a-dsn'
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(isSentryConfigured()).toBe(false)
    expect(() => sendErrorToSentry(new Error('boom'))).not.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalled()
  })

  it('POSTs an envelope to the endpoint derived from the DSN', () => {
    process.env.SENTRY_DSN = DSN
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    sendErrorToSentry(new Error('boom'), { scope: 'nexxi.llm_turn' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]

    expect(url).toBe('https://o4509.ingest.us.sentry.io/api/4510/envelope/')
    const headers = opts.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/x-sentry-envelope')
    expect(headers['X-Sentry-Auth']).toContain('sentry_key=abc123def456')
    expect(headers['X-Sentry-Auth']).toContain('sentry_version=7')
  })

  it('sends a well-formed exception event', () => {
    process.env.SENTRY_DSN = DSN
    process.env.VERCEL_ENV = 'production'
    process.env.VERCEL_GIT_COMMIT_SHA = 'abc1234'
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    sendErrorToSentry(new TypeError('bad input'), { scope: 'scan', route: 'api/scan', attempt: 2 })

    const { header, itemHeader, event } = parseEnvelope(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    )

    expect(header.event_id).toMatch(/^[0-9a-f]{32}$/)
    expect(itemHeader).toEqual({ type: 'event', content_type: 'application/json' })
    expect(event.level).toBe('error')
    expect(event.environment).toBe('production')
    expect(event.release).toBe('abc1234')
    expect(event.exception.values[0].type).toBe('TypeError')
    expect(event.exception.values[0].value).toBe('bad input')
    // scope and route are promoted to searchable tags; everything stays in extra.
    expect(event.tags).toEqual({ scope: 'scan', route: 'api/scan' })
    expect(event.extra).toEqual({ scope: 'scan', route: 'api/scan', attempt: 2 })
  })

  it('parses stack frames oldest-first and flags app frames', () => {
    process.env.SENTRY_DSN = DSN
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const error = new Error('boom')
    error.stack = [
      'Error: boom',
      '    at inner (/var/task/lib/server/scan.ts:10:5)',
      '    at /var/task/app/api/scan/route.ts:22:9',
      '    at node:internal/process/task_queues:95:5',
      '    at handler (/var/task/node_modules/next/server.js:1:1)',
    ].join('\n')

    sendErrorToSentry(error)

    const { event } = parseEnvelope((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    const frames = event.exception.values[0].stacktrace.frames

    // Reversed: Sentry renders oldest first, so the node_modules frame leads.
    expect(frames).toHaveLength(4)
    expect(frames[0].filename).toBe('/var/task/node_modules/next/server.js')
    expect(frames[0].in_app).toBe(false)
    expect(frames[1].filename).toBe('node:internal/process/task_queues')
    expect(frames[1].in_app).toBe(false)
    expect(frames[2].filename).toBe('/var/task/app/api/scan/route.ts')
    expect(frames[2].in_app).toBe(true)
    expect(frames[2].function).toBeUndefined()
    expect(frames[3]).toMatchObject({ filename: '/var/task/lib/server/scan.ts', function: 'inner', lineno: 10, colno: 5, in_app: true })
  })

  it('handles non-Error throwables without a stacktrace', () => {
    process.env.SENTRY_DSN = DSN
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    sendErrorToSentry('a string was thrown')

    const { event } = parseEnvelope((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(event.exception.values[0].type).toBe('UnknownError')
    expect(event.exception.values[0].value).toBe('a string was thrown')
    expect(event.exception.values[0].stacktrace).toBeUndefined()
  })

  it('sends countable warning signals with stable, privacy-safe grouping', () => {
    process.env.SENTRY_DSN = DSN
    process.env.VERCEL_ENV = 'production'
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    sendSignalToSentry('a2a.v1.auth.denied', {
      route: '/api/v1/a2a',
      errorClass: 'entitlement_required',
      environment: 'production',
    })

    const { event } = parseEnvelope((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(event).toMatchObject({
      level: 'warning',
      logger: 'nexez',
      message: 'a2a.v1.auth.denied',
      environment: 'production',
      fingerprint: ['a2a-operational-signal', 'a2a.v1.auth.denied', 'entitlement_required'],
      tags: {
        event: 'a2a.v1.auth.denied',
        errorClass: 'entitlement_required',
        route: '/api/v1/a2a',
      },
    })
    expect(event.extra).not.toHaveProperty('ownerId')
    expect(event.extra).not.toHaveProperty('apiKey')
  })

  it('never throws when Sentry is unreachable, and surfaces the failure', async () => {
    process.env.SENTRY_DSN = DSN
    const fetchMock = vi.fn(async () => {
      throw new Error('network down')
    })
    vi.stubGlobal('fetch', fetchMock)

    expect(() => sendErrorToSentry(new Error('boom'))).not.toThrow()
    await vi.waitFor(() => expect(console.warn).toHaveBeenCalledWith('[nexez] Sentry unreachable:', 'network down'))
  })

  it('warns when Sentry rejects the envelope', async () => {
    process.env.SENTRY_DSN = DSN
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 429, statusText: 'Too Many Requests' })))

    sendErrorToSentry(new Error('boom'))

    await vi.waitFor(() =>
      expect(console.warn).toHaveBeenCalledWith('[nexez] Sentry rejected the event: 429 Too Many Requests'),
    )
  })
})
