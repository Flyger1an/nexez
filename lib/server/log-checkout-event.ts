import { AgentPage, CheckoutOffer, getCheckoutOfferKey } from '../agent-page'
import { fireOutboundWebhook, OutboundWebhookPayload } from '../webhooks'
import { fireOwnerOutboundWebhooks } from './outbound-webhooks'
import { ownerAllows } from './plan'
import type { CheckoutEventType } from '../checkout-events'
import { getPagePrivateMeta } from './page-private-meta'
import { hasInngestEnv, inngest } from '../inngest/client'
import { OUTBOUND_WEBHOOKS_DISPATCH } from '../inngest/events'
import { insertVerifiedCheckoutEvent } from './analytics-ingestion'

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
  // Phase 6 A/B: auto-attribute the event to the offer's variant so every
  // conversion (checkout route, Calendly/Stripe webhooks) rolls up per variant
  // without touching each call site. Explicit metadata still wins.
  const abMeta = offer.ab_test ? { ab_test: offer.ab_test, ab_label: offer.ab_label || '' } : {}
  const mergedMetadata: Record<string, unknown> = { ...abMeta, ...(metadata ?? {}) }
  const privateMeta = await getPagePrivateMeta(page.id)
  const ownerId = (page as { owner_id?: string | null }).owner_id ?? privateMeta.ownerId

  try {
    const write = await insertVerifiedCheckoutEvent({
      page_id: page.id,
      owner_id: ownerId,
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
      metadata: mergedMetadata,
    }, {
      source: typeof mergedMetadata.source === 'string' ? mergedMetadata.source : 'checkout_runtime',
      replayKey: stripeSessionId || null,
    })
    const error = write.error as { message?: string } | null

    // Phase 3: Automatically fire per-page outbound webhooks on high-value Nexez-driven events.
    // This makes the outbound_webhooks saved in Settings fire for agent bookings that go through checkout.
    if (!error && metadata?.dry_run !== true) {
      const valuableEvents: CheckoutEventType[] = ['provider_redirect', 'stripe_session_created', 'checkout_attempt']
      if (valuableEvents.includes(eventType)) {
        try {
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

          // Durable path: hand the whole fan-out (plan gate, per-page + owner
          // endpoints, delivery bookkeeping) to the job runner, where each
          // delivery is a retried step (lib/inngest/functions/outbound-webhooks).
          // Falls through to the inline path only if the emit itself fails.
          let dispatched = false
          if (hasInngestEnv()) {
            try {
              await inngest.send({
                name: OUTBOUND_WEBHOOKS_DISPATCH,
                data: { ownerId: ownerId ?? null, pageId: page.id, payload: obPayload },
              })
              dispatched = true
            } catch (e) {
              console.warn('[Checkout Events] Inngest emit failed - falling back to inline dispatch:', e)
            }
          }

          if (!dispatched) {
            const { createAdminClient, hasSupabaseAdminEnv } = await import('../../utils/supabase/admin')
            if (!hasSupabaseAdminEnv()) return { ok: !error, error }
            const admin = createAdminClient()

            // Outbound webhooks are Pro+ - re-check at dispatch time (not just at
            // create time) so a downgraded owner stops receiving BOTH per-page and
            // account-level deliveries. (fireOwnerOutboundWebhooks self-gates too.)
            if (!ownerId || !(await ownerAllows(admin, ownerId, 'outboundWebhooks'))) return { ok: !error, error }

            // Per-page webhooks (configured in a page's Settings).
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
              // Support richer shape {url, secret?} for signing (same as Calendly receiver)
              const outboundsFull = (pageSecrets as any)?.outbound_webhooks || []
              for (const ep of endpoints) {
                const stored = Array.isArray(outboundsFull) ? outboundsFull.find((o: any) => (o?.url || o) === ep) : null
                const secret = stored?.secret || null
                const res = await fireOutboundWebhook(ep, secret, obPayload)
                console.log(`[Checkout Events] Fired outbound ${obPayload.event} to ${ep} (secret: ${!!secret}):`, res)
              }
            }

            // Account-level webhooks (Tools → Developer platform): fire for every
            // valuable event across all of the owner's pages, page-config or not.
            await fireOwnerOutboundWebhooks(admin, ownerId, obPayload)
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
