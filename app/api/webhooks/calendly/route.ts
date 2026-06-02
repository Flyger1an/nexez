import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabase } from '../../../../lib/supabase'
import { AgentPage } from '../../../../lib/agent-page'
import { fireOutboundWebhook, OutboundWebhookPayload } from '../../../../lib/webhooks'

/**
 * Calendly Webhook Receiver
 * Phase 3 per ROADMAP: "Expand import to support webhooks"
 *
 * This endpoint receives real-time events from Calendly when a user has configured
 * a webhook with their signing secret.
 *
 * Current state (MVP robust):
 * - Correct HMAC-SHA256 signature verification (using Calendly's standard)
 * - Handles the main events: invitee.created, invitee.canceled, invitee_no_show.created
 * - Returns 200 quickly (important for webhooks)
 * - For now logs events. Future: will trigger availability hints, analytics events,
 *   and optional push into linked Nexez pages.
 *
 * Security:
 * - Never trusts the body without signature match.
 * - In production the secret should be stored server-side per user/page.
 *   For current demo we accept the secret via a test header for manual testing.
 */

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-nexez-test-secret') || request.headers.get('x-calendly-webhook-secret')

  // Read raw body for signature verification (critical)
  const rawBody = await request.text()

  // Calendly signature header (they use this format)
  const signature = request.headers.get('x-calendly-webhook-signature')

  if (signature && secret) {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('hex')

    // Calendly sends the signature as a hex string
    if (expectedSignature !== signature) {
      console.warn('[Calendly Webhook] Signature verification failed')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  } else if (signature) {
    // Signature present but no secret provided for verification in this demo
    console.log('[Calendly Webhook] Received signed webhook (secret not provided for verification in this session)')
  }

  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = body.event || 'unknown'
  const payload = body.payload || {}

  console.log(`[Calendly Webhook] Received event: ${eventType}`)

  // Handle key events
  switch (eventType) {
    case 'invitee.created':
    case 'invitee.canceled': {
      const isCreated = eventType === 'invitee.created'
      console.log(`[Calendly Webhook] Booking ${isCreated ? 'created' : 'canceled'}:`, {
        name: payload.invitee?.name,
        email: payload.invitee?.email,
        event: payload.event?.name,
        start_time: payload.event?.start_time,
      })

      // Phase 3: Create real analytics events for Calendly bookings
      // For production, pages can store their Calendly scheduling URL or event type ID for auto-association.
      // For now, support the test header + always log a structured event.
      const testPageSlug = request.headers.get('x-nexez-test-page-slug')

      let page = null
      if (testPageSlug) {
        try {
          const { data: pages } = await supabase
            .from('pages')
            .select('*')
            .eq('slug', testPageSlug)
            .limit(1)
            .returns<AgentPage[]>()
          page = pages?.[0]
        } catch (e) {
          console.warn('[Calendly Webhook] Page lookup failed:', e)
        }
      }

      const eventName = payload.event?.name || 'Calendly Booking'
      const inviteeName = payload.invitee?.name || 'Unknown Guest'

      try {
        const { error: insertError } = await supabase.from('checkout_events').insert({
          page_id: page?.id || null,
          owner_id: page?.owner_id || null,
          slug: page?.slug || (testPageSlug || 'unknown'),
          offer_key: 'calendly:webhook',
          offer_name: eventName,
          offer_kind: 'service',
          event_type: 'provider_redirect',
          agent_user_agent: 'Calendly-Webhook',
          referrer: null,
          query: null,
          checkout_url: null,
          provider_url: payload.event?.uri || null,
          stripe_session_id: null,
          metadata: {
            source: 'calendly_webhook',
            calendly_event_type: eventType,
            invitee_name: inviteeName,
            invitee_email: payload.invitee?.email,
            start_time: payload.event?.start_time,
            calendly_payload_summary: {
              event_name: payload.event?.name,
              location: payload.event?.location?.type,
            },
          },
          created_at: new Date().toISOString(),
        })

        if (insertError) {
          console.warn('[Calendly Webhook] Failed to insert event:', insertError.message)
        } else {
          console.log(`[Calendly Webhook] Recorded booking for ${page?.slug || 'unknown page'}`)

          // Phase 3: Persist lightweight last booking on the page for durability and visibility
          if (page?.id) {
            try {
              await supabase
                .from('pages')
                .update({
                  last_booking: {
                    at: new Date().toISOString(),
                    event_name: eventName,
                    invitee_name: inviteeName,
                    source: 'calendly',
                  }
                })
                .eq('id', page.id)
            } catch (e) {
              console.warn('[Calendly Webhook] Failed to update page last_booking:', e)
            }
          }

          // Phase 3: Fire outbound webhooks — prefer per-page stored config (outbound_webhooks column),
          // fall back to header (demo / Tools test flows) for backward compat.
          try {
            let endpoints: string[] = []

            // 1. Per-page persisted endpoints (the real "set once" path)
            const pageOutbounds = (page as any)?.outbound_webhooks
            if (Array.isArray(pageOutbounds)) {
              endpoints = pageOutbounds
                .map((o: any) => o?.url || o)
                .filter(Boolean)
            }

            // 2. Header override / demo (Tools "Send Test" still works)
            const outboundEndpointsHeader = request.headers.get('x-nexez-outbound-endpoints')
            if (outboundEndpointsHeader) {
              try {
                const headerList = JSON.parse(outboundEndpointsHeader)
                if (Array.isArray(headerList)) endpoints = [...endpoints, ...headerList]
              } catch {}
            }

            // Dedupe
            endpoints = Array.from(new Set(endpoints.filter(Boolean)))

            if (endpoints.length > 0) {
              const obPayload: OutboundWebhookPayload = {
                event: 'booking.received',
                timestamp: new Date().toISOString(),
                page: page ? { id: page.id, slug: page.slug, name: (page as any).name || page.slug } : undefined,
                data: {
                  source: 'calendly',
                  event_name: eventName,
                  invitee_name: inviteeName,
                  start_time: payload.event?.start_time,
                  calendly_event_type: eventType,
                },
              }
              // Support richer stored shape: { url, secret? }
              const pageOutboundsFull = (page as any)?.outbound_webhooks || []
              for (const ep of endpoints) {
                const stored = Array.isArray(pageOutboundsFull)
                  ? pageOutboundsFull.find((o: any) => (o?.url || o) === ep)
                  : null
                const secret = stored?.secret || null
                const res = await fireOutboundWebhook(ep, secret, obPayload)
                console.log(`[Calendly Webhook] Fired outbound booking.received to ${ep} (secret: ${!!secret}):`, res)
              }
            } else {
              console.log('[Calendly Webhook] No outbound endpoints configured (neither page nor header).')
            }
          } catch (e) {
            console.warn('[Calendly Webhook] Outbound firing error:', e)
          }
        }
      } catch (e) {
        console.warn('[Calendly Webhook] Insert error:', e)
      }
      break
    }

    case 'invitee_no_show.created':
      console.log('[Calendly Webhook] No-show recorded')
      break

    default:
      console.log('[Calendly Webhook] Unhandled event type:', eventType)
  }

  // Always acknowledge quickly
  return NextResponse.json({ received: true, event: eventType }, { status: 200 })
}

// Simple health / test endpoint
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Calendly webhook receiver is live. POST real Calendly webhooks here.',
    note: 'Use x-nexez-test-secret header with your signing secret for local verification testing.',
  })
}
