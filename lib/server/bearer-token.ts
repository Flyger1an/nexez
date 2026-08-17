import 'server-only'
import { createHash, randomBytes } from 'crypto'
import { encryptSecret, decryptSecret, hasSecretCryptoKey } from './secret-crypto'

// Storage helpers for the two buyer-facing bearer credentials:
// `checkout_orders.access_token` and `agent_negotiations.status_token`.
//
// Each is stored twice, because the two jobs need different properties:
//
//   * `*_sha256` is a BLIND INDEX. Deterministic, so the equality lookups that used
//     to match the plaintext column match this instead. Not a secret; it is only
//     ever compared against a hash of a value the caller already presented.
//   * `*_encrypted` is AES-256-GCM ciphertext, for the flows that must RECOVER the
//     token to rebuild a link the buyer clicks (receipt email, find-my-orders, the
//     owner deep link). Its random IV makes it unsearchable, which is precisely why
//     the hash column exists alongside it.
//
// Plain SHA-256 rather than HMAC on purpose: the migration backfills the index in
// SQL, so lookups cut over without waiting on an application backfill. The inputs
// are 128+ bits of CSPRNG output, so there is no dictionary to attack. Do NOT reuse
// this for low-entropy inputs.

/** Mint a fresh bearer token: 64 hex chars, matching the shape the dropped column
 * DEFAULT produced (two concatenated UUIDs) but from a single 32-byte CSPRNG draw,
 * so the entropy is 256 bits rather than two v4 UUIDs' 122. */
export function mintBearerToken(): string {
  return randomBytes(32).toString('hex')
}

/** Blind index for a bearer token. Stable, lowercase hex, safe to store and index. */
export function hashBearerToken(token: string | null | undefined): string | null {
  const clean = (token || '').trim()
  if (!clean) return null
  return createHash('sha256').update(clean, 'utf8').digest('hex')
}

/** The columns to write whenever a bearer token is minted or rotated. Spread this
 * into the insert so a caller cannot write one half and forget the other.
 *
 * `encrypted` is null when INTEGRATION_SECRET_KEY is absent. That is a degraded but
 * safe state: the hash still authenticates, and link rebuilding falls back to the
 * plaintext column until it is dropped. Callers must not treat null as an error. */
export function bearerTokenColumns(
  token: string,
  prefix: 'access_token' | 'status_token',
): Record<string, string | null> {
  return {
    [`${prefix}_sha256`]: hashBearerToken(token),
    [`${prefix}_encrypted`]: encryptSecret(token),
  }
}

/** Recover a token for link rebuilding: ciphertext first, plaintext while it lasts.
 * Returns null when neither is usable, and callers should degrade to a link that
 * does not carry a token rather than emitting a broken one. */
export function recoverBearerToken(row: {
  encrypted?: string | null
  plaintext?: string | null
}): string | null {
  const fromCipher = decryptSecret(row.encrypted)
  if (fromCipher) return fromCipher
  const fallback = (row.plaintext || '').trim()
  return fallback || null
}

/** Whether ciphertext can be written at all. Surfaced so a backfill can refuse to
 * run, and report why, instead of silently writing a column full of nulls. */
export function canEncryptBearerTokens(): boolean {
  return hasSecretCryptoKey()
}

/** The plaintext/ciphertext column pair for each table that stores a bearer token. */
export const BEARER_TOKEN_COLUMNS = {
  checkout_orders: { plain: 'access_token', cipher: 'access_token_encrypted' },
  agent_negotiations: { plain: 'status_token', cipher: 'status_token_encrypted' },
} as const

export type BearerTokenTable = keyof typeof BEARER_TOKEN_COLUMNS

/**
 * Write the ciphertext for a row whose plaintext we already hold, when it is missing.
 *
 * `checkout_orders.access_token` is minted by a column DEFAULT and the three writers
 * are UPSERTs that deliberately omit the column, because including it would let a
 * webhook redelivery mint a fresh token and invalidate a link already emailed to the
 * buyer. So the app cannot encrypt at insert time; it encrypts immediately after,
 * against the value the database chose.
 *
 * Idempotent and best-effort: it never overwrites an existing ciphertext, does
 * nothing without a key, and returns rather than throwing, because failing to write
 * a recovery copy must never fail the money path that called it.
 */
export async function ensureBearerCiphertext(
  admin: { from: (table: string) => any },
  table: BearerTokenTable,
  idColumn: string,
  idValue: string,
): Promise<'written' | 'present' | 'no_key' | 'not_found'> {
  if (!hasSecretCryptoKey()) return 'no_key'
  const cols = BEARER_TOKEN_COLUMNS[table]

  const { data } = await admin
    .from(table)
    .select(`id, ${cols.plain}, ${cols.cipher}`)
    .eq(idColumn, idValue)
    .maybeSingle()
  if (!data) return 'not_found'
  if (data[cols.cipher]) return 'present'

  const plaintext = (data[cols.plain] || '').trim()
  if (!plaintext) return 'not_found'

  const ciphertext = encryptSecret(plaintext)
  if (!ciphertext) return 'no_key'

  const { error } = await admin
    .from(table)
    .update({ [cols.cipher]: ciphertext })
    .eq('id', data.id)
  return error ? 'not_found' : 'written'
}
