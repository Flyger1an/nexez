import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { releaseResourceHold } from '../../../../lib/server/reservable-resource'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../utils/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const LIMIT = 50

type ExpiredHold = {
  id: string
  status: 'active' | 'payment_pending'
  stripe_checkout_session_id: string | null
  stripe_connect_account_id: string | null
}

/**
 * Expire unattached holds, then ask Stripe for terminal truth before releasing
 * attached inventory. An expired local clock is never enough for a
 * payment-pending allocation.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, error: 'cron_secret_not_configured' }, { status: 503 })
  }
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasSupabaseAdminEnv() || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('resource_holds')
    .select('id, status, stripe_checkout_session_id, stripe_connect_account_id')
    .in('status', ['active', 'payment_pending'])
    .lte('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true })
    .limit(LIMIT)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  let activeExpired = 0
  let providerExpired = 0
  let stillOpen = 0
  let paidAwaitingWebhook = 0
  let providerUnavailable = 0

  for (const hold of (data ?? []) as ExpiredHold[]) {
    if (hold.status === 'active') {
      const released = await releaseResourceHold({ admin, holdId: hold.id, reason: 'unattached_expiry' })
      if (released.ok) activeExpired += 1
      continue
    }
    if (!hold.stripe_checkout_session_id || !hold.stripe_connect_account_id) {
      providerUnavailable += 1
      continue
    }
    try {
      const session = await stripe.checkout.sessions.retrieve(
        hold.stripe_checkout_session_id,
        {},
        { stripeAccount: hold.stripe_connect_account_id },
      )
      if (session.status === 'expired') {
        const released = await releaseResourceHold({
          admin,
          holdId: hold.id,
          reason: 'provider_expired',
          stripeCheckoutSessionId: session.id,
        })
        if (released.ok) providerExpired += 1
      } else if (session.status === 'complete' && session.payment_status === 'paid') {
        // Preserve allocation. The signed completion event is the only path that
        // commits reservation + order lineage; Stripe retries it independently.
        paidAwaitingWebhook += 1
      } else {
        stillOpen += 1
      }
    } catch {
      // Provider uncertainty preserves inventory. A later webhook or cron retry
      // resolves it; local time never invents a terminal payment state.
      providerUnavailable += 1
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: (data ?? []).length,
    activeExpired,
    providerExpired,
    stillOpen,
    paidAwaitingWebhook,
    providerUnavailable,
  })
}
