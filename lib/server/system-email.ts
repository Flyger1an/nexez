import 'server-only'
import { createHash } from 'node:crypto'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { hasEmailEnv, sendEmail } from '../email'

const MAX_ATTEMPTS = 3
const STALE_CLAIM_MS = 15 * 60_000

type SystemEmailRow = {
  owner_id: string
  kind: string
  delivery_claimed_at: string | null
  delivered_at: string | null
  abandoned_at: string | null
  delivery_attempts: number
}

function idempotencyKey(ownerId: string, kind: string): string {
  return `system-${createHash('sha256').update(`${ownerId}:${kind}`).digest('hex')}`
}

/**
 * Send a transactional system email at most once per (owner, kind), with a
 * recoverable claim. A process can die after claiming without stranding the email:
 * another invocation may reclaim it after fifteen minutes, while Resend receives a
 * deterministic idempotency key for provider-side duplicate protection.
 */
export async function sendOnceSystemEmail(opts: {
  ownerId: string
  kind: string
  to: string
  build: () => Promise<{ subject: string; html: string; text: string }>
}): Promise<{ sent: boolean; skipped?: boolean; reason?: string }> {
  if (!opts.ownerId || !opts.to) return { sent: false, skipped: true, reason: 'missing owner/recipient' }
  if (!hasEmailEnv() || !hasSupabaseAdminEnv()) return { sent: false, skipped: true, reason: 'email/admin disabled' }

  const admin = createAdminClient()
  const nowIso = new Date().toISOString()
  const staleIso = new Date(Date.now() - STALE_CLAIM_MS).toISOString()
  let attempt = 1
  const { data: inserted, error: insertError } = await admin
    .from('sent_system_emails')
    .insert({
      owner_id: opts.ownerId,
      kind: opts.kind,
      delivery_claimed_at: nowIso,
      delivery_attempts: attempt,
    })
    .select('owner_id')
    .maybeSingle<{ owner_id: string }>()

  if (!inserted) {
    if (insertError?.code !== '23505') {
      return { sent: false, skipped: true, reason: insertError?.message || 'claim_failed' }
    }

    const { data: existing, error: existingError } = await admin
      .from('sent_system_emails')
      .select('owner_id, kind, delivery_claimed_at, delivered_at, abandoned_at, delivery_attempts')
      .eq('owner_id', opts.ownerId)
      .eq('kind', opts.kind)
      .maybeSingle<SystemEmailRow>()
    if (existingError || !existing) {
      return { sent: false, skipped: true, reason: existingError?.message || 'claim_unavailable' }
    }
    if (existing.delivered_at) return { sent: false, skipped: true, reason: 'already_sent' }
    if (existing.abandoned_at || existing.delivery_attempts >= MAX_ATTEMPTS) {
      return { sent: false, skipped: true, reason: 'abandoned' }
    }
    if (existing.delivery_claimed_at && existing.delivery_claimed_at >= staleIso) {
      return { sent: false, skipped: true, reason: 'in_flight' }
    }

    attempt = existing.delivery_attempts + 1
    const { data: reclaimed, error: reclaimError } = await admin
      .from('sent_system_emails')
      .update({
        delivery_claimed_at: nowIso,
        delivery_attempts: attempt,
        last_error: null,
      })
      .eq('owner_id', opts.ownerId)
      .eq('kind', opts.kind)
      .eq('delivery_attempts', existing.delivery_attempts)
      .is('delivered_at', null)
      .is('abandoned_at', null)
      .or(`delivery_claimed_at.is.null,delivery_claimed_at.lt.${staleIso}`)
      .select('owner_id')
      .maybeSingle<{ owner_id: string }>()
    if (reclaimError || !reclaimed) {
      return { sent: false, skipped: true, reason: reclaimError?.message || 'in_flight' }
    }
  }

  try {
    const mail = await opts.build()
    const res = await sendEmail({
      to: opts.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      idempotencyKey: idempotencyKey(opts.ownerId, opts.kind),
    })
    if (!res.ok) {
      const exhausted = attempt >= MAX_ATTEMPTS
      await admin.from('sent_system_emails').update({
        delivery_claimed_at: null,
        ...(exhausted ? { abandoned_at: nowIso } : {}),
        last_error: (res.error || 'send failed').slice(0, 500),
      }).eq('owner_id', opts.ownerId).eq('kind', opts.kind)
      return { sent: false, reason: res.error || 'send failed' }
    }
    await admin.from('sent_system_emails').update({
      delivery_claimed_at: null,
      delivered_at: nowIso,
      provider_message_id: res.id ?? null,
      last_error: null,
    }).eq('owner_id', opts.ownerId).eq('kind', opts.kind)
    return { sent: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'email build failed'
    const exhausted = attempt >= MAX_ATTEMPTS
    await admin.from('sent_system_emails').update({
      delivery_claimed_at: null,
      ...(exhausted ? { abandoned_at: nowIso } : {}),
      last_error: message.slice(0, 500),
    }).eq('owner_id', opts.ownerId).eq('kind', opts.kind)
    return { sent: false, reason: message }
  }
}
