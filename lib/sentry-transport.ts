import 'server-only'
// Sentry error ingestion over plain fetch, deliberately without @sentry/nextjs.
//
// This file exists so `captureError` in lib/observability.ts can fan out to
// Sentry in addition to the Better Stack webhook. It is a transport, not a
// second observability path: nothing should import it except that seam.
//
// Why no SDK: @sentry/nextjs wants next.config wrapping, instrumentation hooks,
// and a build-time upload step. That is a large surface to add days before a
// launch, and it buys automatic capture of unhandled errors that this codebase
// already routes through captureError in 55 files. The envelope endpoint is a
// stable, documented HTTP API, so the whole integration is one POST.
//
// SENTRY_DSN gates it. Unset means every function here is a no-op and the app
// behaves exactly as it did before, which is the launch-safety property that
// matters most.

type SentryFrame = {
  filename: string
  function?: string
  lineno?: number
  colno?: number
  in_app: boolean
}

type ParsedDsn = { envelopeUrl: string; publicKey: string }

/** Cached across invocations in a warm lambda; `null` means parsed and invalid. */
let cachedDsn: ParsedDsn | null | undefined
let cachedDsnSource: string | undefined

export function isSentryConfigured(): boolean {
  return Boolean(parseDsn(process.env.SENTRY_DSN))
}

/**
 * DSN shape: https://<publicKey>@o<org>.ingest.<region>.sentry.io/<projectId>
 * The envelope endpoint is the same origin with /api/<projectId>/envelope/.
 */
function parseDsn(raw: string | undefined): ParsedDsn | null {
  if (!raw) return null
  if (cachedDsnSource === raw) return cachedDsn ?? null

  cachedDsnSource = raw
  try {
    const url = new URL(raw)
    const projectId = url.pathname.replace(/^\/+/, '').split('/').filter(Boolean).pop()
    if (!url.username || !projectId) throw new Error('missing public key or project id')
    cachedDsn = {
      envelopeUrl: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
      publicKey: url.username,
    }
  } catch (err) {
    // Warn once per distinct value. A malformed DSN is worse than none, because
    // you would believe errors are being collected when they are being dropped.
    console.warn('[nexez] SENTRY_DSN is not a valid DSN, Sentry reporting is off:', err instanceof Error ? err.message : String(err))
    cachedDsn = null
  }
  return cachedDsn ?? null
}

/**
 * Node stack frames, newest first. Sentry renders frames oldest first, so the
 * parsed list is reversed before it goes out.
 */
function parseStack(stack: string | undefined): SentryFrame[] {
  if (!stack) return []
  const frames: SentryFrame[] = []

  for (const line of stack.split('\n').slice(1)) {
    const text = line.trim()
    if (!text.startsWith('at ')) continue
    const body = text.slice(3).trim()

    // `fn (/path/file.ts:1:2)` or a bare `/path/file.ts:1:2`
    const withFn = body.match(/^(.*?)\s+\((.*):(\d+):(\d+)\)$/)
    const bare = body.match(/^(.*):(\d+):(\d+)$/)
    const [fn, filename, lineno, colno] = withFn
      ? [withFn[1], withFn[2], withFn[3], withFn[4]]
      : bare
        ? [undefined, bare[1], bare[2], bare[3]]
        : [undefined, undefined, undefined, undefined]
    if (!filename) continue

    frames.push({
      filename,
      ...(fn ? { function: fn } : {}),
      lineno: Number(lineno),
      colno: Number(colno),
      // node_modules and node internals are library code; marking them out of
      // app scope is what makes Sentry's grouping and "suspect commit" useful.
      in_app: !filename.includes('node_modules') && !filename.startsWith('node:'),
    })
  }

  return frames.reverse()
}

/**
 * Fire-and-forget. Never throws into the caller and never awaits, matching the
 * contract the rest of lib/observability.ts already holds.
 */
export function sendErrorToSentry(error: unknown, context: Record<string, unknown> = {}): void {
  const dsn = parseDsn(process.env.SENTRY_DSN)
  if (!dsn) return

  try {
    const isError = error instanceof Error
    const eventId = crypto.randomUUID().replace(/-/g, '')
    const sentAt = new Date().toISOString()
    const frames = parseStack(isError ? error.stack : undefined)

    const event = {
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: 'node',
      level: 'error',
      logger: 'nexez',
      environment: process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
      ...(process.env.VERCEL_GIT_COMMIT_SHA ? { release: process.env.VERCEL_GIT_COMMIT_SHA } : {}),
      exception: {
        values: [
          {
            type: isError ? error.name || 'Error' : 'UnknownError',
            value: isError ? error.message : String(error),
            ...(frames.length ? { stacktrace: { frames } } : {}),
          },
        ],
      },
      // `scope` and `route` are the two keys callers pass most often, so they
      // are promoted to tags where they become searchable and groupable.
      tags: {
        ...(typeof context.scope === 'string' ? { scope: context.scope } : {}),
        ...(typeof context.route === 'string' ? { route: context.route } : {}),
      },
      extra: context,
    }

    const envelope = [
      JSON.stringify({ event_id: eventId, sent_at: sentAt }),
      JSON.stringify({ type: 'event', content_type: 'application/json' }),
      JSON.stringify(event),
    ].join('\n')

    void fetch(dsn.envelopeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=nexez-transport/1.0, sentry_key=${dsn.publicKey}`,
      },
      body: envelope,
      signal: AbortSignal.timeout(4000),
    })
      .then((res) => {
        if (!res.ok) console.warn(`[nexez] Sentry rejected the event: ${res.status} ${res.statusText}`)
      })
      .catch((err) => {
        console.warn('[nexez] Sentry unreachable:', err instanceof Error ? err.message : String(err))
      })
  } catch {
    // ignore, never let error reporting break the error path
  }
}
