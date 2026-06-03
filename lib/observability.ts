// Lightweight error observability — gated behind env. When OBSERVABILITY_WEBHOOK_URL
// is set, errors are POSTed there (Sentry-style ingest, Slack webhook, etc.);
// otherwise we just console.error. No heavy SDK dependency.

export function isObservabilityConfigured(): boolean {
  return Boolean(process.env.OBSERVABILITY_WEBHOOK_URL)
}

export function captureError(error: unknown, context: Record<string, unknown> = {}): void {
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : undefined

  // Always log locally.
  console.error('[nexez]', message, context)

  const url = process.env.OBSERVABILITY_WEBHOOK_URL
  if (!url) return

  // Fire-and-forget; never throw from the error path.
  try {
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service: 'nexez',
        level: 'error',
        message,
        stack,
        context,
        ts: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(4000),
    }).catch(() => {})
  } catch {
    // ignore
  }
}
