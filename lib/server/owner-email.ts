import 'server-only'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'

/**
 * The recipient for a private OWNER notification (new proposal, booking, escrow,
 * refund, dispute, buyer request). Prefer the authenticated owner's account email.
 * A page contact is public buyer-facing data and may be a receptionist, an imported
 * placeholder, or an address the account owner does not monitor. Use it only when the
 * private owner lookup is unavailable. Returns null only when neither address exists.
 */
export async function resolveOwnerNotifyEmail(opts: {
  contactEmail?: string | null
  ownerId?: string | null
}): Promise<string | null> {
  const contact = (opts.contactEmail || '').trim()
  if (opts.ownerId && hasSupabaseAdminEnv()) {
    try {
      const admin = createAdminClient()
      const { data } = await admin.auth.admin.getUserById(opts.ownerId)
      const ownerEmail = data?.user?.email?.trim()
      if (ownerEmail) return ownerEmail
    } catch {
      // The public contact remains a best-effort fallback for an unavailable auth lookup.
    }
  }
  return contact || null
}
