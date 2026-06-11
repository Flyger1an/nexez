// Lightweight error observability — gated behind env. When OBSERVABILITY_WEBHOOK_URL
// is set, errors are POSTed there (Better Stack / Logtail, Axiom, Slack relay, etc.);
// otherwise we just console.error. No heavy SDK dependency.
//
// OBSERVABILITY_WEBHOOK_TOKEN (optional): sent as `Authorization: Bearer <token>`.
// Required by ingests that authenticate with a bearer token (e.g. a Better Stack
// source token). Omit it for unauthenticated webhooks where the URL is the secret.

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

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = process.env.OBSERVABILITY_WEBHOOK_TOKEN
  if (token) headers['Authorization'] = `Bearer ${token}`

  // Fire-and-forget; never throw from the error path.
  try {
    void fetch(url, {
      method: 'POST',
      headers,
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
