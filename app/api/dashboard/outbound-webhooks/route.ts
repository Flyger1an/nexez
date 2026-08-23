import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import { createClient } from '../../../../utils/supabase/server'
import {
  fireOutboundWebhook,
  getResolvedWebhookEndpointError,
  getWebhookEndpointError,
  type OutboundWebhookPayload,
} from '../../../../lib/webhooks'
import { ownerAllows } from '../../../../lib/server/plan'
import { minPlanForFeature } from '../../../../lib/billing'

// Account-level outbound webhooks for the Tools → Developer platform UI. Owners
// register endpoints here; Nexez delivers HMAC-signed events to them on bookings
// and checkout/re-sync activity (see lib/server/outbound-webhooks.ts). All access
// is owner-scoped via RLS on public.outbound_webhooks.

const SELECT = 'id, url, active, last_delivery_at, last_status, secret, created_at'

async function requireUser() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

export async function GET() {
  const { supabase, user } = await requireUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data, error } = await supabase
    .from('outbound_webhooks')
    .select(SELECT)
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ webhooks: data ?? [] })
}

export async function POST(request: Request) {
  const { supabase, user } = await requireUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // Plan gate: outbound webhooks (create + test) are a Pro automation feature.
  if (!(await ownerAllows(supabase, user.id, 'outboundWebhooks'))) {
    const required = minPlanForFeature('outboundWebhooks')
    return NextResponse.json(
      { error: `Outbound webhooks are available on the ${required.name} plan and up.`, upgrade: required.id },
      { status: 402 },
    )
  }

  let body: { url?: string; action?: string; id?: string } = {}
  try {
    body = await request.json()
  } catch {
    // empty body is invalid for POST here
  }

  // --- Send a signed test event to an existing webhook ---
  if (body.action === 'test') {
    if (!body.id) return NextResponse.json({ error: 'A webhook id is required.' }, { status: 400 })
    const { data: webhook, error } = await supabase
      .from('outbound_webhooks')
      .select('id, url, secret')
      .eq('id', body.id)
      .eq('owner_id', user.id)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (!webhook) return NextResponse.json({ error: 'Webhook not found.' }, { status: 404 })

    const payload: OutboundWebhookPayload = {
      event: 'test.webhook',
      timestamp: new Date().toISOString(),
      data: { test: true, source: 'tools_outbound_test', message: 'Test event from Nexez Tools.' },
    }
    const result = (await fireOutboundWebhook(webhook.url, webhook.secret ?? null, payload)) as {
      ok: boolean
      status?: number
      error?: string
    }
    await supabase
      .from('outbound_webhooks')
      .update({
        last_delivery_at: new Date().toISOString(),
        last_status: result.ok ? 'ok' : result.error || `http_${result.status ?? 'error'}`,
      })
      .eq('id', webhook.id)
      .eq('owner_id', user.id)
    return NextResponse.json({ success: result.ok, status: result.status ?? null, error: result.error ?? null })
  }

  // --- Register a new webhook endpoint ---
  const url = (body.url || '').trim()
  if (!url) return NextResponse.json({ error: 'A webhook URL is required.' }, { status: 400 })

  const literalError = getWebhookEndpointError(url)
  if (literalError) return NextResponse.json({ error: literalError }, { status: 400 })
  const resolvedError = await getResolvedWebhookEndpointError(url)
  if (resolvedError) return NextResponse.json({ error: resolvedError }, { status: 400 })

  const secret = `whsec_${crypto.randomBytes(24).toString('hex')}`
  const { data, error } = await supabase
    .from('outbound_webhooks')
    .insert({ owner_id: user.id, url, secret })
    .select(SELECT)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ webhook: data }, { status: 201 })
}

export async function DELETE(request: Request) {
  const { supabase, user } = await requireUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'A webhook id is required.' }, { status: 400 })

  const { error } = await supabase.from('outbound_webhooks').delete().eq('id', id).eq('owner_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
