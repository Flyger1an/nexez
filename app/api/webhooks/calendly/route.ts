import { NextRequest, NextResponse, after } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import type { AgentPage } from '../../../../lib/agent-page'
import { getBaseUrl } from '../../../../lib/agent-page'
import { buildBookingEmail, hasEmailEnv, sendEmail } from '../../../../lib/email'
import { fireOutboundWebhook, type OutboundWebhookPayload } from '../../../../lib/webhooks'
import { fireOwnerOutboundWebhooks } from '../../../../lib/server/outbound-webhooks'
import { ownerAllows } from '../../../../lib/server/plan'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { createClient as createServerClient } from '../../../../utils/supabase/server'

type CalendlyPayload = {
  event?: string
  payload?: {
    invitee?: {
      name?: string
      email?: string
    }
    event?: {
      name?: string
      start_time?: string
      uri?: string
      location?: {
        type?: string
      }
    }
  }
}

type WebhookPage = Pick<AgentPage, 'id' | 'owner_id' | 'slug' | 'name' | 'contact_email'>

export async function POST(request: NextRequest) {
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is required for Calendly webhooks.' }, { status: 412 })
  }

  const rawBody = await request.text()
  const signature = request.headers.get('x-calendly-webhook-signature')
  const testPageSlug = request.headers.get('x-nexez-test-page-slug') || new URL(request.url).searchParams.get('slug') || ''
  const headerSecret = request.headers.get('x-nexez-test-secret') || request.headers.get('x-calendly-webhook-secret')
  const isTestMode = request.headers.get('x-nexez-test-mode') === 'true'
  const allowDevHeaderSecret = process.env.NODE_ENV !== 'production' && Boolean(headerSecret)
  const supabase = createAdminClient()

  if (!testPageSlug) {
    return NextResponse.json({ error: 'A page slug is required. Add ?slug=your-page-slug to the webhook URL.' }, { status: 400 })
  }

  const { data: pages, error: pageError } = await supabase
    .from('pages')
    .select('id, owner_id, slug, name, contact_email')
    .eq('slug', testPageSlug)
    .limit(1)
    .returns<WebhookPage[]>()

  if (pageError) {
    return NextResponse.json({ error: pageError.message }, { status: 500 })
  }

  const page = pages?.[0] || null
  if (!page) {
    return NextResponse.json({ error: 'Page not found for Calendly webhook slug.' }, { status: 404 })
  }

  const { data: pageSecrets } = await supabase
    .from('page_secrets')
    .select('calendly_webhook_secret, outbound_webhooks')
    .eq('page_id', page.id)
    .maybeSingle()

  const perPageSecret = pageSecrets?.calendly_webhook_secret || null
  const ownerCanTest = isTestMode && headerSecret ? await isAuthenticatedPageOwner(page.owner_id) : false
  const canUseHeaderSecret = allowDevHeaderSecret || ownerCanTest
  const secret = perPageSecret || (canUseHeaderSecret ? headerSecret : null)

  if (!secret) {
    return NextResponse.json({ error: 'Calendly webhook secret is not configured for this page.' }, { status: 401 })
  }

  if (!signature && !canUseHeaderSecret) {
    return NextResponse.json({ error: 'Missing Calendly webhook signature.' }, { status: 401 })
  }

  if (signature && !verifyCalendlySignature(rawBody, secret, signature)) {
    console.warn('[Calendly Webhook] Signature verification failed for slug', page.slug)
    return NextResponse.json({ error: 'Invalid Calendly signature.' }, { status: 401 })
  }

  let body: CalendlyPayload
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = body.event || 'unknown'
  const payload = body.payload || {}

  if (eventType !== 'invitee.created' && eventType !== 'invitee.canceled') {
    return NextResponse.json({ received: true, event: eventType, handled: false }, { status: 200 })
  }

  const eventName = payload.event?.name || 'Calendly Booking'
  const inviteeName = payload.invitee?.name || 'Unknown Guest'
  const startedAt = payload.event?.start_time || null

  const { error: insertError } = await supabase.from('checkout_events').insert({
    page_id: page.id,
    owner_id: page.owner_id || null,
    slug: page.slug,
    offer_key: 'calendly:webhook',
    offer_name: eventName,
    offer_kind: 'services',
    event_type: 'provider_redirect',
    agent_user_agent: 'Calendly-Webhook',
    referrer: null,
    query: null,
    checkout_url: null,
    provider_url: payload.event?.uri || null,
    stripe_session_id: null,
    metadata: {
      source: 'calendly_webhook',
      test_mode: isTestMode,
      calendly_event_type: eventType,
      invitee_name: inviteeName,
      invitee_email: payload.invitee?.email,
      start_time: startedAt,
      calendly_payload_summary: {
        event_name: payload.event?.name,
        location: payload.event?.location?.type,
      },
    },
  })

  if (insertError) {
    console.warn('[Calendly Webhook] Failed to insert event:', insertError.message)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const { error: updateError } = await supabase
    .from('pages')
    .update({
      last_booking: {
        at: new Date().toISOString(),
        event_name: eventName,
        invitee_name: inviteeName,
        source: 'calendly',
      },
    })
    .eq('id', page.id)

  if (updateError) {
    console.warn('[Calendly Webhook] Failed to update page last_booking:', updateError.message)
  }

  // Notify the business by email on a new booking (gated on RESEND_API_KEY).
  if (eventType === 'invitee.created' && hasEmailEnv() && page.contact_email) {
    const to = page.contact_email
    after(async () => {
      const mail = await buildBookingEmail({
        businessName: page.name || page.slug,
        eventName,
        inviteeName,
        inviteeEmail: payload.invitee?.email,
        startTime: startedAt,
        source: 'Calendly',
        inboxUrl: `${getBaseUrl()}/dashboard`,
      })
      await sendEmail({ to, subject: mail.subject, html: mail.html, text: mail.text })
    })
  }

  // One booking payload, delivered to both the per-page webhooks and the owner's
  // account-level webhooks (Tools → Developer platform).
  const bookingPayload: OutboundWebhookPayload = {
    event: 'booking.received',
    timestamp: new Date().toISOString(),
    page: { id: page.id, slug: page.slug, name: page.name || page.slug },
    data: {
      source: 'calendly',
      event_name: eventName,
      invitee_name: inviteeName,
      start_time: startedAt,
      calendly_event_type: eventType,
    },
  }
  // Outbound webhooks are Pro+ — re-check at dispatch time so a downgraded owner
  // stops receiving deliveries (both per-page and account-level). `supabase` here
  // is the service-role client, so the plan resolves correctly.
  const obAllowed = await ownerAllows(supabase, page.owner_id, 'outboundWebhooks')
  const outboundResults = obAllowed ? await firePageOutbounds(pageSecrets?.outbound_webhooks, bookingPayload) : []
  const accountOutboundResults = obAllowed ? await fireOwnerOutboundWebhooks(supabase, page.owner_id, bookingPayload) : []

  return NextResponse.json({
    received: true,
    event: eventType,
    page: page.slug,
    outbound: outboundResults,
    accountOutbound: accountOutboundResults,
  })
}

async function isAuthenticatedPageOwner(ownerId: string | null) {
  if (!ownerId) return false

  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(cookieStore)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user?.id === ownerId
  } catch {
    return false
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Calendly webhook receiver is live. POST signed Calendly webhooks here.',
    usage: '/api/webhooks/calendly?slug=your-page-slug',
  })
}

async function firePageOutbounds(outbounds: AgentPage['outbound_webhooks'], payload: OutboundWebhookPayload) {
  const pageOutbounds = outbounds
  if (!Array.isArray(pageOutbounds) || pageOutbounds.length === 0) return []

  const results = []
  for (const stored of pageOutbounds) {
    const endpoint = typeof stored === 'string' ? stored : stored?.url
    const secret = typeof stored === 'string' ? null : stored?.secret || null
    if (!endpoint) continue
    const result = await fireOutboundWebhook(endpoint, secret, payload)
    results.push({ endpoint, ...result })
  }

  return results
}

function verifyCalendlySignature(rawBody: string, secret: string, signature: string) {
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const provided = parseCalendlySignature(signature)
  if (!provided) return false

  const expectedBuffer = Buffer.from(expected, 'hex')
  const providedBuffer = Buffer.from(provided, 'hex')
  if (expectedBuffer.length !== providedBuffer.length) return false

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer)
}

function parseCalendlySignature(signature: string) {
  const trimmed = signature.trim()
  const v1 = trimmed.match(/(?:^|,)v1=([a-f0-9]+)/i)?.[1]
  return v1 || (/^[a-f0-9]+$/i.test(trimmed) ? trimmed : null)
}
