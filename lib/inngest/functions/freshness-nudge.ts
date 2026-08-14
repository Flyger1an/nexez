// Durable stale-listing re-interview nudge. The daily freshness cron finds due
// pages and (when Inngest is configured) emits one FRESHNESS_NUDGE event per
// page instead of sending inline; this function does the send durably:
// resolve the recipient, send the seller-facet email (retried on transient
// failure), and stamp the page_freshness_nudges cooldown ledger only after a
// successful send - exactly the inline path's semantics, step by step.

import { inngest } from '../client'
import { FRESHNESS_NUDGE, type FreshnessNudgeData } from '../events'
import { buildStaleListingEmail, hasEmailEnv, sendEmail } from '../../email'
import { resolveOwnerNotifyEmail } from '../../server/owner-email'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../utils/supabase/admin'

export const processFreshnessNudge = inngest.createFunction(
  { id: 'freshness-nudge', retries: 3, triggers: { event: FRESHNESS_NUDGE } },
  async ({ event, step }) => {
    const data = event.data as FreshnessNudgeData

    if (!hasEmailEnv()) return { skipped: 'no_email_env' }

    const to = await step.run('resolve-recipient', () =>
      resolveOwnerNotifyEmail({ contactEmail: data.contactEmail, ownerId: data.ownerId }),
    )
    if (!to) return { skipped: 'no_recipient' }

    const sendResult = await step.run('send-email', async () => {
      const mail = await buildStaleListingEmail({
        businessName: data.businessName,
        listingName: data.listingName,
        freshnessLabel: data.freshnessLabel,
        reinterviewUrl: data.reinterviewUrl,
        editUrl: data.editUrl,
      })
      const res = await sendEmail({ to, subject: mail.subject, html: mail.html, text: mail.text })
      // skipped = RESEND_API_KEY unset between emit and processing: permanent
      // for this run, not worth retrying. A real send failure retries.
      if (!res.ok && !res.skipped) throw new Error(res.error || 'send failed')
      return { sent: res.ok, skipped: Boolean(res.skipped) }
    })
    if (!sendResult.sent) return { skipped: 'send_skipped' }

    // Stamp the cooldown clock only after a successful send (same rule as the
    // inline path) so a failed nudge is retried tomorrow rather than suppressed
    // for a whole cooldown window.
    await step.run('stamp-ledger', async () => {
      if (!hasSupabaseAdminEnv()) return { stamped: false }
      const admin = createAdminClient()
      await admin.from('page_freshness_nudges').upsert(
        {
          page_id: data.pageId,
          owner_id: data.ownerId,
          last_nudged_at: new Date().toISOString(),
          nudge_count: data.priorNudgeCount + 1,
        },
        { onConflict: 'page_id' },
      )
      return { stamped: true }
    })

    return { nudged: true, pageId: data.pageId }
  },
)
