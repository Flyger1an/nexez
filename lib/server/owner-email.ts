import 'server-only'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'

/**
 * The recipient for an OWNER notification (new proposal, booking, escrow, refund/
 * dispute, buyer request). Prefer the page's explicit `contact_email`; when it's not
 * set - which is the common case, many pages never fill it - fall back to the owner's
 * ACCOUNT email via a service-role auth lookup. Without this fallback those owners
 * silently receive no notifications at all (the send branch is skipped for lack of a
 * recipient). Returns null only when there's genuinely no address to reach.
 */
export async function resolveOwnerNotifyEmail(opts: {
  contactEmail?: string | null
  ownerId?: string | null
}): Promise<string | null> {
  const contact = (opts.contactEmail || '').trim()
  if (contact) return contact
  if (!opts.ownerId || !hasSupabaseAdminEnv()) return null
  try {
    const admin = createAdminClient()
    const { data } = await admin.auth.admin.getUserById(opts.ownerId)
    return data?.user?.email?.trim() || null
  } catch {
    return null
  }
}
