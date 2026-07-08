import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '../../../../../utils/supabase/server'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../../../utils/supabase/admin'
import { resolvePageAccess } from '../../../../../lib/server/page-access'
import { enforceRateLimit } from '../../../../../lib/rate-limit'
import { encryptSecret, hasSecretCryptoKey } from '../../../../../lib/server/secret-crypto'
import { getCalendlyUser } from '../../../../../lib/server/calendly-write'

/**
 * Upsert the page's owner-only secrets (domain verification token, Calendly webhook
 * secret, outbound webhooks) - collaborator-aware. page_secrets is owner-RLS'd, so an
 * editor can't write it directly; this route authorizes via resolvePageAccess
 * (requireEditor) and writes via the service-role client scoped to the PAGE OWNER.
 * Only the three known secret columns are accepted (no arbitrary column writes).
 */
const ALLOWED_KEYS = ['calendly_webhook_secret', 'outbound_webhooks', 'domain_verification_token'] as const

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(request, 'page-secrets', 30, 60_000)
  if (limited) return limited

  const { id: pageId } = await ctx.params
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!hasSupabaseAdminEnv()) return NextResponse.json({ error: 'Not available.' }, { status: 503 })

  const access = await resolvePageAccess({ pageId, userId: user.id, userEmail: user.email, userEmailConfirmedAt: user.email_confirmed_at, requireEditor: true })
  if (!access) return NextResponse.json({ error: 'You do not have edit access to this page.' }, { status: 403 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  // Whitelist: only the known secret columns, never owner_id/page_id from the client.
  const values: Record<string, unknown> = {}
  for (const key of ALLOWED_KEYS) {
    if (key in body) values[key] = body[key]
  }

  // Calendly PAT: a powerful write-scope credential — encrypt at rest (the
  // ciphertext column is service-role-read-only) and NEVER echo it back. An
  // empty value clears the stored token.
  if ('calendly_pat' in body) {
    if (!hasSecretCryptoKey()) {
      return NextResponse.json({ error: 'Credential storage is not configured on this deployment.' }, { status: 503 })
    }
    const raw = typeof body.calendly_pat === 'string' ? body.calendly_pat.trim() : ''
    if (raw) {
      // Don't store a token Calendly definitively rejects. A network/unknown
      // error still stores (the token may be fine; don't block on Calendly
      // downtime), but a 401/403 fails the save with a clear message.
      const check = await getCalendlyUser(raw)
      if (!check.ok && check.reason === 'invalid') {
        return NextResponse.json({ error: 'Calendly rejected that token. Check it and try again.' }, { status: 400 })
      }
      const encrypted = encryptSecret(raw)
      if (!encrypted) return NextResponse.json({ error: 'Could not secure the credential.' }, { status: 500 })
      values.calendly_pat_encrypted = encrypted
    } else {
      values.calendly_pat_encrypted = null // explicit clear
    }
  }

  if (!Object.keys(values).length) return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('page_secrets').upsert(
    { page_id: access.pageId, owner_id: access.ownerId, ...values, updated_at: new Date().toISOString() },
    { onConflict: 'page_id' },
  )
  if (error) {
    console.warn('[page-secrets] upsert failed:', error.message)
    return NextResponse.json({ error: 'Could not save settings.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
