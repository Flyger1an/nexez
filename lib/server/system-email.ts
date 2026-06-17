import 'server-only'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { hasEmailEnv, sendEmail } from '../email'

/**
 * Send a transactional "system" email AT MOST ONCE per (owner, kind). The send-once
 * guard is a unique insert into sent_system_emails (service-role): a 23505 conflict
 * means we already sent it, so we skip. Race-safe + idempotent across webhook
 * redeliveries and repeat logins. If the actual send fails, the claim row is rolled
 * back so a later trigger can retry (we don't strand the email). No-ops when email or
 * the admin env is unavailable (dormant like the other gated integrations).
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
  const { error: claimErr } = await admin.from('sent_system_emails').insert({ owner_id: opts.ownerId, kind: opts.kind })
  if (claimErr) {
    // 23505 = already sent (the common case). Any other error → don't send (fail-safe).
    return { sent: false, skipped: true, reason: claimErr.code === '23505' ? 'already_sent' : claimErr.message }
  }

  const mail = await opts.build()
  const res = await sendEmail({ to: opts.to, subject: mail.subject, html: mail.html, text: mail.text })
  if (!res.ok) {
    // Roll back the claim so a future trigger can retry instead of stranding the email.
    await admin.from('sent_system_emails').delete().eq('owner_id', opts.ownerId).eq('kind', opts.kind)
    return { sent: false, reason: res.error }
  }
  return { sent: true }
}
