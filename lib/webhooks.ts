/**
 * Basic Outbound Webhook Support (Phase 3 foundation)
 * 
 * For now this is a lightweight utility. In production this would be
 * stored per-page or per-organization with proper secrets, retries, etc.
 */

export type OutboundWebhookPayload = {
  event: string
  timestamp: string
  page?: {
    id: string
    slug: string
    name: string
  }
  data: Record<string, any>
}

export async function fireOutboundWebhook(endpoint: string, secret: string | null, payload: OutboundWebhookPayload) {
  try {
    const body = JSON.stringify(payload)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Nexez Webhooks/1.0',
    }

    if (secret) {
      // Simple HMAC-style signature for now (can be improved)
      headers['X-Nexez-Signature'] = await generateSimpleSignature(body, secret)
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body,
    })

    return { ok: res.ok, status: res.status }
  } catch (error: any) {
    console.error('[Outbound Webhook] Failed to fire:', error.message)
    return { ok: false, error: error.message }
  }
}

async function generateSimpleSignature(body: string, secret: string): Promise<string> {
  // In a real app we'd use Web Crypto or a library.
  // For now, a very basic hash (not production secure, but demonstrates the idea).
  const encoder = new TextEncoder()
  const data = encoder.encode(body + secret)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
