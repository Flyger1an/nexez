import 'server-only'
import { randomUUID } from 'node:crypto'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import type { SelfServePlanId } from '../billing'

export type BillingCheckoutFlow = 'embedded' | 'hosted'

export type BillingCheckoutAttempt = {
  owner_id: string
  attempt_key: string
  plan_id: SelfServePlanId
  flow: BillingCheckoutFlow
  state: 'initializing' | 'ready'
  stripe_object_id: string | null
  expires_at: string
  created_at?: string
  updated_at?: string
}

type SupersededAttempt = Pick<BillingCheckoutAttempt, 'flow' | 'stripe_object_id'>

export type ClaimBillingCheckoutAttemptResult =
  | { ok: true; attempt: BillingCheckoutAttempt; reused: boolean; superseded?: SupersededAttempt }
  | { ok: false; reason: 'busy' | 'unavailable' }

const ATTEMPT_TTL_MS = 30 * 60 * 1000
const ATTEMPT_SELECT = 'owner_id, attempt_key, plan_id, flow, state, stripe_object_id, expires_at, created_at, updated_at'

function isUnexpired(attempt: BillingCheckoutAttempt, nowMs: number) {
  const expiresMs = Date.parse(attempt.expires_at)
  return Number.isFinite(expiresMs) && expiresMs > nowMs
}

function matches(attempt: BillingCheckoutAttempt, planId: string, flow: BillingCheckoutFlow) {
  return attempt.plan_id === planId && attempt.flow === flow
}

async function readAttempt(ownerId: string): Promise<BillingCheckoutAttempt | null> {
  const { data } = await createAdminClient()
    .from('billing_checkout_attempts')
    .select(ATTEMPT_SELECT)
    .eq('owner_id', ownerId)
    .maybeSingle<BillingCheckoutAttempt>()
  return data ?? null
}

/**
 * Atomically claims the owner's single checkout slot. Same-plan retries reuse the
 * existing key; a competing plan/flow receives `busy`. Expired claims are replaced
 * with a compare-and-swap update so only one concurrent request can win.
 */
export async function claimBillingCheckoutAttempt(input: {
  ownerId: string
  planId: SelfServePlanId
  flow: BillingCheckoutFlow
  now?: Date
}): Promise<ClaimBillingCheckoutAttemptResult> {
  if (!hasSupabaseAdminEnv()) return { ok: false, reason: 'unavailable' }

  const now = input.now ?? new Date()
  const nowMs = now.getTime()
  const nowIso = now.toISOString()
  const attempt: BillingCheckoutAttempt = {
    owner_id: input.ownerId,
    attempt_key: randomUUID(),
    plan_id: input.planId,
    flow: input.flow,
    state: 'initializing',
    stripe_object_id: null,
    expires_at: new Date(nowMs + ATTEMPT_TTL_MS).toISOString(),
    updated_at: nowIso,
  }

  const admin = createAdminClient()
  const { data: inserted, error: insertError } = await admin
    .from('billing_checkout_attempts')
    .insert(attempt)
    .select(ATTEMPT_SELECT)
    .maybeSingle<BillingCheckoutAttempt>()

  if (inserted && !insertError) return { ok: true, attempt: inserted, reused: false }
  if (insertError?.code !== '23505') return { ok: false, reason: 'unavailable' }

  let existing = await readAttempt(input.ownerId)
  if (!existing) return { ok: false, reason: 'unavailable' }
  if (isUnexpired(existing, nowMs)) {
    return matches(existing, input.planId, input.flow)
      ? { ok: true, attempt: existing, reused: true }
      : { ok: false, reason: 'busy' }
  }

  const previous: SupersededAttempt = { flow: existing.flow, stripe_object_id: existing.stripe_object_id }
  const { data: replaced, error: replaceError } = await admin
    .from('billing_checkout_attempts')
    .update({
      attempt_key: attempt.attempt_key,
      plan_id: attempt.plan_id,
      flow: attempt.flow,
      state: attempt.state,
      stripe_object_id: null,
      expires_at: attempt.expires_at,
      updated_at: nowIso,
    })
    .eq('owner_id', input.ownerId)
    .lte('expires_at', nowIso)
    .select(ATTEMPT_SELECT)
    .maybeSingle<BillingCheckoutAttempt>()

  if (replaced && !replaceError) {
    return { ok: true, attempt: replaced, reused: false, superseded: previous }
  }
  if (replaceError) return { ok: false, reason: 'unavailable' }

  // Another request replaced the expired claim first. Read its winner and either
  // join the same operation or fail closed while that competing checkout is active.
  existing = await readAttempt(input.ownerId)
  if (existing && isUnexpired(existing, nowMs) && matches(existing, input.planId, input.flow)) {
    return { ok: true, attempt: existing, reused: true }
  }
  return { ok: false, reason: existing ? 'busy' : 'unavailable' }
}

export function stripeBillingIdempotencyKey(attemptKey: string, operation: string) {
  return `nexez-billing:${operation}:${attemptKey}`.slice(0, 255)
}

type StripeCheckoutCleanupClient = {
  checkout: { sessions: { expire: (id: string) => Promise<unknown> } }
  subscriptions: {
    retrieve: (id: string) => Promise<{ status: string }>
    cancel: (id: string) => Promise<unknown>
  }
}

/**
 * Retire the Stripe object left by an expired checkout claim without risking a
 * paid subscription. A delayed webhook may leave an active subscription attached
 * to the expired claim, so subscription IDs must be inspected before cancellation.
 */
export async function retireSupersededBillingObject(
  stripe: StripeCheckoutCleanupClient,
  stripeObjectId: string,
): Promise<'expired' | 'canceled' | 'preserved' | 'ignored'> {
  if (stripeObjectId.startsWith('cs_')) {
    await stripe.checkout.sessions.expire(stripeObjectId)
    return 'expired'
  }
  if (!stripeObjectId.startsWith('sub_')) return 'ignored'

  const subscription = await stripe.subscriptions.retrieve(stripeObjectId)
  if (subscription.status !== 'incomplete') return 'preserved'

  await stripe.subscriptions.cancel(stripeObjectId)
  return 'canceled'
}

export async function markBillingCheckoutAttemptReady(ownerId: string, attemptKey: string, stripeObjectId: string) {
  if (!hasSupabaseAdminEnv()) return false
  const { error } = await createAdminClient()
    .from('billing_checkout_attempts')
    .update({ state: 'ready', stripe_object_id: stripeObjectId, updated_at: new Date().toISOString() })
    .eq('owner_id', ownerId)
    .eq('attempt_key', attemptKey)
  return !error
}

export async function releaseBillingCheckoutAttempt(ownerId: string, attemptKey?: string) {
  if (!hasSupabaseAdminEnv()) return false
  let query = createAdminClient().from('billing_checkout_attempts').delete().eq('owner_id', ownerId)
  if (attemptKey) query = query.eq('attempt_key', attemptKey)
  const { error } = await query
  return !error
}
