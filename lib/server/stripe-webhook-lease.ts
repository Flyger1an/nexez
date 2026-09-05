import 'server-only'
import { randomUUID } from 'node:crypto'
import type Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'

/** Call only after signature verification. Completion follows business persistence. */
export async function withStripeWebhookLease(event: Stripe.Event, process: () => Promise<Response>): Promise<Response> {
  if (!hasSupabaseAdminEnv()) return NextResponse.json({ error: 'Webhook persistence is unavailable.' }, { status: 503 })
  const admin = createAdminClient()
  const token = randomUUID()
  try {
    const { data: claim, error } = await admin.rpc('nz_claim_stripe_event', {
      p_event_id: event.id, p_type: event.type, p_account: event.account ?? null,
      p_payload: event, p_lease_token: token,
    })
    if (error) throw new Error('Could not claim webhook event.', { cause: error })
    if (claim === 'completed') return NextResponse.json({ received: true, type: event.type, duplicate: true })
    if (claim !== 'claimed') return NextResponse.json({ error: 'Webhook processing is already in progress. Retry later.' }, { status: 503 })
    let response: Response
    try {
      response = await process()
    } catch (error) {
      await admin.rpc('nz_finish_stripe_event', {
        p_event_id: event.id, p_lease_token: token, p_error: 'Business processing threw before completion.',
      })
      throw error
    }
    const { data: finished, error: finishError } = await admin.rpc('nz_finish_stripe_event', {
      p_event_id: event.id, p_lease_token: token,
      p_error: response.ok ? null : `Business processing returned HTTP ${response.status}.`,
    })
    if (finishError || finished !== true) throw new Error('Webhook completion could not be confirmed.')
    return response
  } catch (error) {
    console.warn('[Stripe Webhook] retry required', event.id, error instanceof Error ? error.message : 'Unknown failure')
    return NextResponse.json({ error: 'Webhook processing could not be completed. Retry this event.' }, { status: 503 })
  }
}
