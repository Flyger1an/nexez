/**
 * Basic Outbound Webhook Support (Phase 3 foundation)
 *
 * Server routes use this to fire user-configured webhooks. Keep validation
 * here so tests, checkout events, and provider webhooks share the same guardrails.
 */

export type OutboundWebhookPayload = {
  event: string
  timestamp: string
  page?: {
    id: string
    slug: string
    name: string
  }
  data: Record<string, unknown>
}

const WEBHOOK_TIMEOUT_MS = 5000
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^0(?:\.0){0,3}$/,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^\[?::1\]?$/i,
  /^\[?fc[0-9a-f]{2}:/i,
  /^\[?fd[0-9a-f]{2}:/i,
  /^\[?fe80:/i,
]

export function getWebhookEndpointError(endpoint: string): string | null {
  let url: URL

  try {
    url = new URL(endpoint)
  } catch {
    return 'Webhook endpoint must be a valid URL.'
  }

  if (url.protocol !== 'https:') {
    return 'Webhook endpoint must use HTTPS.'
  }

  const hostname = url.hostname.toLowerCase()
  if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) {
    return 'Webhook endpoint cannot target localhost, private networks, or link-local addresses.'
  }

  if (!hostname.includes('.') && !hostname.endsWith('webhook.site')) {
    return 'Webhook endpoint must use a public hostname.'
  }

  return null
}

export async function fireOutboundWebhook(endpoint: string, secret: string | null, payload: OutboundWebhookPayload) {
  try {
    const endpointError = getWebhookEndpointError(endpoint)
    if (endpointError) return { ok: false, error: endpointError }

    const body = JSON.stringify(payload)
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Nexez Webhooks/1.0',
      'X-Nexez-Timestamp': timestamp,
    }

    if (secret) {
      headers['X-Nexez-Signature'] = await generateHmacSignature(body, secret, timestamp)
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS)

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout))

    return { ok: res.ok, status: res.status }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Outbound webhook failed.'
    console.error('[Outbound Webhook] Failed to fire:', message)
    return { ok: false, error: message }
  }
}

async function generateHmacSignature(body: string, secret: string, timestamp: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${body}`))
  const hex = Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `t=${timestamp},v1=${hex}`
}
