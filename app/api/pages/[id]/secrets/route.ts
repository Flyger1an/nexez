import { NextResponse } from 'next/server'
import { requirePageAccess } from '../../../../../lib/server/require-page-access'
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
const ALLOWED_KEYS = ['calendly_webhook_secret', 'outbound_webhooks', 'domain_verification_token', 'website_verification_token'] as const

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(request, 'page-secrets', 30, 60_000)
  if (limited) return limited

  const { id: pageId } = await ctx.params

  const gate = await requirePageAccess({ pageId, unavailableMessage: 'Not available.' })
  if (!gate.ok) return gate.response
  const { access, admin } = gate

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

  // Shopify connection ({shop, token}) — same encrypted-at-rest, service-role-only
  // model as the Calendly PAT, stored as one JSON blob so a re-sync never
  // re-prompts. Empty shop OR token clears the connection.
  if ('shopify_credentials' in body) {
    if (!hasSecretCryptoKey()) {
      return NextResponse.json({ error: 'Credential storage is not configured on this deployment.' }, { status: 503 })
    }
    const c = (body.shopify_credentials ?? {}) as { shop?: unknown; token?: unknown }
    const shop = typeof c.shop === 'string' ? c.shop.trim() : ''
    const token = typeof c.token === 'string' ? c.token.trim() : ''
    if (shop && token) {
      const encrypted = encryptSecret(JSON.stringify({ shop, token }))
      if (!encrypted) return NextResponse.json({ error: 'Could not secure the credential.' }, { status: 500 })
      values.shopify_credentials_encrypted = encrypted
    } else {
      values.shopify_credentials_encrypted = null // explicit clear
    }
  }

  // Square {accessToken} + Acuity {userId, apiKey} — same encrypted-at-rest,
  // service-role-only model. Any empty required field clears the connection.
  for (const [key, col, fields] of [
    ['square_credentials', 'square_credentials_encrypted', ['accessToken']],
    ['acuity_credentials', 'acuity_credentials_encrypted', ['userId', 'apiKey']],
  ] as const) {
    if (!(key in body)) continue
    if (!hasSecretCryptoKey()) {
      return NextResponse.json({ error: 'Credential storage is not configured on this deployment.' }, { status: 503 })
    }
    const c = (body[key] ?? {}) as Record<string, unknown>
    const picked = fields.map((f) => (typeof c[f] === 'string' ? (c[f] as string).trim() : ''))
    if (picked.every((v) => v)) {
      const payload = Object.fromEntries(fields.map((f, i) => [f, picked[i]]))
      const encrypted = encryptSecret(JSON.stringify(payload))
      if (!encrypted) return NextResponse.json({ error: 'Could not secure the credential.' }, { status: 500 })
      values[col] = encrypted
    } else {
      values[col] = null // explicit clear
    }
  }

  if (!Object.keys(values).length) return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 })

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
