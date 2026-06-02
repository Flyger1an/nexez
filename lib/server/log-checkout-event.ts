import { AgentPage, CheckoutOffer, getCheckoutOfferKey } from '../agent-page'
import { supabase } from '../supabase'
import { fireOutboundWebhook, OutboundWebhookPayload } from '../webhooks'
import type { CheckoutEventType } from '../checkout-events'

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
    if (!error && metadata?.dry_run !== true) {
      const valuableEvents: CheckoutEventType[] = ['provider_redirect', 'stripe_session_created', 'checkout_attempt']
      if (valuableEvents.includes(eventType)) {
        try {
          const { createAdminClient, hasSupabaseAdminEnv } = await import('../../utils/supabase/admin')
          if (!hasSupabaseAdminEnv()) return { ok: !error, error }
          const admin = createAdminClient()
          const { data: pageSecrets } = await admin
            .from('page_secrets')
            .select('outbound_webhooks')
            .eq('page_id', page.id)
            .maybeSingle()

          const outbounds = (pageSecrets as any)?.outbound_webhooks
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
                name: page.name || page.slug,
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
            const outboundsFull = (pageSecrets as any)?.outbound_webhooks || []
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
