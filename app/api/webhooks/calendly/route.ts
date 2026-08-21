import { NextRequest, NextResponse, after } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import type { AgentPage } from '../../../../lib/agent-page'
import { getBaseUrl, getCheckoutOfferKey } from '../../../../lib/agent-page'
import {
  applyOfferAvailability,
  computeAvailability,
  findOfferByEventName,
  offerBookingCap,
} from '../../../../lib/calendly-availability'
import { countRecentBookings } from '../../../../lib/server/booking-count'
import { captureEvent } from '../../../../lib/observability'
import { buildBookingEmail, hasEmailEnv, sendEmail } from '../../../../lib/email'
import { resolveOwnerNotifyEmail } from '../../../../lib/server/owner-email'
import { fireOutboundWebhook, type OutboundWebhookPayload } from '../../../../lib/webhooks'
import { fireOwnerOutboundWebhooks } from '../../../../lib/server/outbound-webhooks'
import { ownerAllows } from '../../../../lib/server/plan'
import { parseNegotiationTracking } from '../../../../lib/calendly-tracking'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'
import { createClient as createServerClient } from '../../../../utils/supabase/server'
import { insertVerifiedCheckoutEvent } from '../../../../lib/server/analytics-ingestion'

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
    // Calendly echoes UTM params the booker arrived with. We stamp
    // utm_content=nz_neg_<id> on negotiation scheduling links so the booking can
    // be linked back to its negotiation for cancel-on-refund.
    tracking?: {
      utm_content?: string | null
    }
  }
}

type WebhookPage = Pick<AgentPage, 'id' | 'slug' | 'name' | 'contact_email' | 'services' | 'products'> & {
  owner_id: string | null
}

export async function POST(request: NextRequest) {
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is required for Calendly webhooks.' }, { status: 412 })
  }

  const rawBody = await request.text()
  // Real Calendly sends `Calendly-Webhook-Signature`; the x- name is kept for
  // manual/legacy integrations that adopted it from this route's docs.
  const signature =
    request.headers.get('calendly-webhook-signature') || request.headers.get('x-calendly-webhook-signature')
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
    .select('id, owner_id, slug, name, contact_email, services, products')
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

  const eventUri = payload.event?.uri || null
  const write = await insertVerifiedCheckoutEvent({
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
    provider_url: eventUri,
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
  }, {
    source: 'calendly_webhook',
    replayKey: eventUri ? `${eventType}:${eventUri}:${payload.invitee?.email || ''}` : null,
  })

  if (!write.ok) {
    const message = (write.error as { message?: string } | null)?.message || 'Could not record Calendly activity.'
    console.warn('[Calendly Webhook] Failed to insert event:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  // Exact booking↔negotiation link for cancel-on-refund. If this booking arrived
  // through a negotiation-tagged Calendly link (utm_content=nz_neg_<id>), record
  // the scheduled-event URI on that negotiation. Scoped to THIS page's id, so a
  // signed webhook can only ever touch its own page's negotiations (cross-page
  // contamination is impossible). First booking wins — never overwrites.
  if (eventType === 'invitee.created') {
    const negId = parseNegotiationTracking(payload.tracking?.utm_content)
    const eventUri = payload.event?.uri || null
    if (negId && eventUri) {
      const { error: linkErr } = await supabase
        .from('agent_negotiations')
        .update({ calendly_event_uri: eventUri })
        .eq('id', negId)
        .eq('page_id', page.id)
        .is('calendly_event_uri', null)
      if (linkErr) console.warn('[Calendly Webhook] negotiation link failed:', linkErr.message)
    }
  }

  // last_booking is a "recent activity" trust signal - only a real booking
  // should stamp it, never a cancellation.
  if (eventType === 'invitee.created') {
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
  }

  // Bi-directional sync: reflect real Calendly bookings in the offer's
  // advertised availability. Only offers that opted into calendar protection
  // (rules.maxBookingsPerWeek - the same cap checkout enforces) are managed;
  // the value is recomputed from the rolling-week count on every event, so
  // created and canceled webhooks both self-correct. The event row above is
  // already inserted, so this count includes the booking that triggered it.
  let availabilitySync: { offer_key: string; availability: string } | null = null
  const offerMatch = findOfferByEventName(page, eventName)
  const bookingCap = offerMatch ? offerBookingCap(offerMatch.offer) : null
  if (!offerMatch) {
    captureEvent('integration.availability_skipped', {
      provider: 'calendly',
      slug: page.slug,
      reason: 'no_matching_offer',
    })
  } else if (bookingCap == null) {
    captureEvent('integration.availability_skipped', {
      provider: 'calendly',
      slug: page.slug,
      reason: 'no_booking_cap',
    })
  } else {
    const offerKey = getCheckoutOfferKey(offerMatch.kind, offerMatch.index)
    const booked = await countRecentBookings(supabase, {
      slug: page.slug,
      offerKey,
      offerName: offerMatch.offer.name,
    })
    const availability = computeAvailability(bookingCap, booked)
    const applied = applyOfferAvailability(
      page[offerMatch.kind] || [],
      offerMatch.index,
      availability,
      new Date().toISOString(),
    )
    if (applied.changed) {
      // pages_public is trigger-maintained, so agents see the flip immediately.
      const { error: availabilityError } = await supabase
        .from('pages')
        .update({ [offerMatch.kind]: applied.offers })
        .eq('id', page.id)
      if (availabilityError) {
        console.warn('[Calendly Webhook] availability sync failed:', availabilityError.message)
      } else {
        availabilitySync = { offer_key: offerKey, availability }
        captureEvent('integration.availability_synced', {
          provider: 'calendly',
          slug: page.slug,
          offerKey,
          availability,
          booked,
          cap: bookingCap,
        })
      }
    }
  }

  // Notify the business by email on a new booking (gated on RESEND_API_KEY). Recipient
  // falls back to the owner's account email when the page has no explicit contact_email.
  if (eventType === 'invitee.created' && hasEmailEnv()) {
    after(async () => {
      const to = await resolveOwnerNotifyEmail({ contactEmail: page.contact_email, ownerId: page.owner_id })
      if (!to) return
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
  // Outbound webhooks are Pro+ - re-check at dispatch time so a downgraded owner
  // stops receiving deliveries (both per-page and account-level). `supabase` here
  // is the service-role client, so the plan resolves correctly.
  const obAllowed = await ownerAllows(supabase, page.owner_id, 'outboundWebhooks')
  const outboundResults = obAllowed ? await firePageOutbounds(pageSecrets?.outbound_webhooks, bookingPayload) : []
  const accountOutboundResults = obAllowed ? await fireOwnerOutboundWebhooks(supabase, page.owner_id, bookingPayload) : []

  return NextResponse.json({
    received: true,
    event: eventType,
    page: page.slug,
    availability_sync: availabilitySync,
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

// Signed webhooks older than this are rejected (replay protection). Calendly
// recommends a ~3 minute tolerance; 5 covers clock skew both directions.
const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000

function verifyCalendlySignature(rawBody: string, secret: string, signature: string) {
  const parsed = parseCalendlySignature(signature)
  if (!parsed) return false

  // Calendly's real scheme (t=...,v1=...) signs `${t}.${body}` - HMACing the
  // body alone would reject every genuine Calendly delivery. The timestamped
  // form also gets a freshness window so captured payloads can't be replayed
  // to inflate booking counts / spam owner notifications. The bare-hex legacy
  // form (HMAC over the body only) is kept for existing manual integrations.
  if (parsed.t != null) {
    const timestampMs = Number(parsed.t) * 1000
    if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > SIGNATURE_TOLERANCE_MS) return false
  }
  const payload = parsed.t != null ? `${parsed.t}.${rawBody}` : rawBody
  const expected = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex')

  const expectedBuffer = Buffer.from(expected, 'hex')
  const providedBuffer = Buffer.from(parsed.v1, 'hex')
  if (expectedBuffer.length !== providedBuffer.length) return false

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer)
}

function parseCalendlySignature(signature: string): { t: string | null; v1: string } | null {
  const trimmed = signature.trim()
  const v1 = trimmed.match(/(?:^|,)v1=([a-f0-9]+)/i)?.[1]
  const t = trimmed.match(/(?:^|,)t=(\d+)/)?.[1] ?? null
  if (v1) return { t, v1 }
  return /^[a-f0-9]+$/i.test(trimmed) ? { t: null, v1: trimmed } : null
}
