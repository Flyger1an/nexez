import { NextRequest, NextResponse } from 'next/server'
import { fireOutboundWebhook, OutboundWebhookPayload } from '../../../lib/webhooks'

/**
 * Test Outbound Webhook (Phase 3)
 * 
 * Allows the Settings page (and future UIs) to send a real test `booking.received` (or generic)
 * payload to a specific endpoint + optional secret.
 * 
 * This makes per-page outbound configuration actually testable end-to-end from the UI
 * ("Send Test" buttons next to each configured webhook).
 */
export async function POST(request: NextRequest) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const endpoint = (body?.endpoint || '').trim()
  const secret = body?.secret || null
  const eventType = body?.eventType || 'booking.received'

  if (!endpoint) {
    return NextResponse.json({ error: 'endpoint is required' }, { status: 400 })
  }

  const payload: OutboundWebhookPayload = {
    event: eventType,
    timestamp: new Date().toISOString(),
    page: body?.page || undefined,
    data: {
      test: true,
      source: 'manual_test',
      message: 'This is a test outbound webhook from Nexez Settings.',
      ... (body?.data || {}),
    },
  }

  const result = await fireOutboundWebhook(endpoint, secret, payload)

  return NextResponse.json({
    success: result.ok,
    status: result.status,
    error: result.error || null,
    endpoint,
    event: eventType,
  })
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    usage: 'POST { endpoint, secret?, eventType?, data?, page? }',
  })
}
