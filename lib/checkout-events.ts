import { AgentPage, CheckoutOffer, getCheckoutOfferKey } from './agent-page'
import { supabase } from './supabase'
import { fireOutboundWebhook, OutboundWebhookPayload } from './webhooks'

export type CheckoutEventType =
  | 'checkout_view'
  | 'checkout_attempt'
  | 'provider_redirect'
  | 'stripe_session_created'
  | 'stripe_missing_config'
  | 'stripe_error'

export type CheckoutEvent = {
  id: string
  page_id: string
  owner_id: string | null
  slug: string
  offer_key: string
  offer_name: string
  offer_kind: CheckoutOffer['kind']
  event_type: CheckoutEventType
  agent_user_agent: string | null
  referrer: string | null
  query: string | null
  checkout_url: string | null
  provider_url: string | null
  stripe_session_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

type LogCheckoutEventInput = {
  page: AgentPage
  offer: CheckoutOffer
  eventType: CheckoutEventType
  userAgent?: string | null
  referrer?: string | null
  query?: string | null
  checkoutUrl?: string | null
  providerUrl?: string | null
  stripeSessionId?: string | null
  metadata?: Record<string, unknown>
}

export async function logCheckoutEvent({
  page,
  offer,
  eventType,
  userAgent,
  referrer,
  query,
  checkoutUrl,
  providerUrl,
  stripeSessionId,
  metadata,
}: LogCheckoutEventInput) {
  try {
    const { error } = await supabase.from('checkout_events').insert({
      page_id: page.id,
      owner_id: page.owner_id,
      slug: page.slug,
      offer_key: getCheckoutOfferKey(offer.kind, offer.index),
      offer_name: offer.name,
      offer_kind: offer.kind,
      event_type: eventType,
      agent_user_agent: userAgent || null,
      referrer: referrer || null,
      query: query || null,
      checkout_url: checkoutUrl || null,
      provider_url: providerUrl || null,
      stripe_session_id: stripeSessionId || null,
      metadata: metadata ?? {},
    })

    // Phase 3: Automatically fire per-page outbound webhooks on high-value Nexez-driven events.
    // This makes the outbound_webhooks saved in Settings fire for agent bookings that go through checkout.
    if (!error) {
      const valuableEvents: CheckoutEventType[] = ['provider_redirect', 'stripe_session_created', 'checkout_attempt']
      if (valuableEvents.includes(eventType)) {
        try {
          // Fetch the latest outbound_webhooks for this page (column added in recent migration)
          const { data: pageWithOutbounds } = await supabase
            .from('pages')
            .select('outbound_webhooks, name, slug, id')
            .eq('id', page.id)
            .single()

          const outbounds = (pageWithOutbounds as any)?.outbound_webhooks
          let endpoints: string[] = []
          if (Array.isArray(outbounds)) {
            endpoints = outbounds.map((o: any) => o?.url || o).filter(Boolean)
          }

          if (endpoints.length > 0) {
            const obPayload: OutboundWebhookPayload = {
              event: eventType === 'provider_redirect' ? 'booking.provider_redirect' : 'booking.checkout_initiated',
              timestamp: new Date().toISOString(),
              page: {
                id: page.id,
                slug: page.slug,
                name: page.name || (pageWithOutbounds as any)?.name || page.slug,
              },
              data: {
                event_type: eventType,
                offer_name: offer.name,
                offer_key: getCheckoutOfferKey(offer.kind, offer.index),
                amount: metadata?.amount_cents || null,
                source: 'nexez_checkout',
              },
            }
            // Support richer shape {url, secret?} for signing (same as Calendly receiver)
            const outboundsFull = (pageWithOutbounds as any)?.outbound_webhooks || []
            for (const ep of endpoints) {
              const stored = Array.isArray(outboundsFull) ? outboundsFull.find((o: any) => (o?.url || o) === ep) : null
              const secret = stored?.secret || null
              const res = await fireOutboundWebhook(ep, secret, obPayload)
              console.log(`[Checkout Events] Fired outbound ${obPayload.event} to ${ep} (secret: ${!!secret}):`, res)
            }
          }
        } catch (e) {
          console.warn('[Checkout Events] Outbound firing error (non-blocking):', e)
        }
      }
    }

    return { ok: !error, error }
  } catch (error) {
    return { ok: false, error }
  }
}

export function getEventActionLabel(eventType: CheckoutEventType) {
  switch (eventType) {
    case 'checkout_view':
      return 'Viewed checkout'
    case 'checkout_attempt':
      return 'Started checkout'
    case 'provider_redirect':
      return 'Opened provider URL'
    case 'stripe_session_created':
      return 'Created Stripe session'
    case 'stripe_missing_config':
      return 'Needs Stripe config'
    case 'stripe_error':
      return 'Stripe error'
  }
}
