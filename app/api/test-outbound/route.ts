import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { fireOutboundWebhook, getWebhookEndpointError, OutboundWebhookPayload } from '../../../lib/webhooks'
import { createClient } from '../../../utils/supabase/server'
import { ownerAllows } from '../../../lib/server/plan'

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
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Sign in to test outbound webhooks.' }, { status: 401 })
  }

  // Outbound webhooks are a Pro (`outboundWebhooks`) capability — gate the test
  // sender too, so it can't be used to fire arbitrary webhooks below Pro.
  if (!(await ownerAllows(supabase, user.id, 'outboundWebhooks'))) {
    return NextResponse.json(
      { error: 'Outbound webhooks are available on the Pro plan and up.', upgrade: 'pro' },
      { status: 402 },
    )
  }

  let body: {
    endpoint?: string
    secret?: string | null
    eventType?: string
    data?: Record<string, unknown>
    pageId?: string
    page?: { id?: string; slug?: string; name?: string }
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const endpoint = (body?.endpoint || '').trim()
  const secret = body?.secret || null
  const eventType = body?.eventType || 'booking.received'
  const pageId = body?.pageId || body?.page?.id || ''

  if (!endpoint) {
    return NextResponse.json({ error: 'endpoint is required' }, { status: 400 })
  }
  // Surface obviously-invalid/SSRF endpoints as a clean 400 (fireOutboundWebhook
  // also runs the resolved-DNS check, but this gives a clearer up-front error).
  const endpointError = getWebhookEndpointError(endpoint)
  if (endpointError) {
    return NextResponse.json({ error: endpointError }, { status: 400 })
  }

  let page = body?.page
  if (pageId) {
    const { data, error } = await supabase
      .from('pages')
      .select('id, slug, name')
      .eq('id', pageId)
      .eq('owner_id', user.id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Page not found, or you do not own it.' }, { status: 403 })
    }

    page = data
  }

  const payload: OutboundWebhookPayload = {
    event: eventType,
    timestamp: new Date().toISOString(),
    page: page?.id && page.slug && page.name ? { id: page.id, slug: page.slug, name: page.name } : undefined,
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
