import 'server-only'

/**
 * Read-your-write reconciliation for the post-checkout success page: retrieve the
 * just-completed Checkout Session from Stripe, expand its subscription, and upsert
 * billing_subscriptions immediately — so the dashboard reflects the new plan the
 * instant the user returns, instead of waiting on webhook latency. Idempotent
 * (upsert by owner_id); the webhook remains the source of truth. Best-effort:
 * returns the resolved plan id or null and never throws.
 */
import Stripe from 'stripe'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { buildBillingSubscriptionRow } from '../stripe-billing'

export async function syncCheckoutSessionForOwner(
  sessionId: string,
  ownerId: string,
): Promise<{ planId: string | null; status: string | null } | null> {
  if (!sessionId || !ownerId) return null
  if (!process.env.STRIPE_SECRET_KEY || !hasSupabaseAdminEnv()) return null
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] })
    // The session MUST belong to this owner — the billing checkout stamps both
    // client_reference_id and metadata.nexez_user_id with the owner id. Require a
    // match so a guessed/forged session_id can't attach someone else's
    // subscription to the caller's row.
    const sessionOwner = session.client_reference_id || (session.metadata?.nexez_user_id as string) || null
    if (sessionOwner !== ownerId) return null
    const subscription = (typeof session.subscription === 'object' ? session.subscription : null) as Stripe.Subscription | null
    if (!subscription && session.mode !== 'subscription') return null

    const row = buildBillingSubscriptionRow({
      ownerId,
      session,
      subscription,
      eventType: 'checkout-success-sync',
    })
    const admin = createAdminClient()
    await admin.from('billing_subscriptions').upsert(row, { onConflict: 'owner_id' })
    return { planId: row.plan_id ?? null, status: row.status ?? null }
  } catch {
    return null
  }
}
