import 'server-only'
import crypto from 'crypto'

// Encryption-at-rest for stored third-party credentials (e.g. a per-page
// Calendly PAT that the future write-side calendar-blocking will use). A DB
// dump or backup leak must not expose a usable token - so these are AES-256-GCM
// encrypted with a key that lives ONLY in the deployment env, never in the DB.
//
// Key: INTEGRATION_SECRET_KEY, a 32-byte key as 64 hex chars or base64. Absent →
// the store is DORMANT (encrypt/decrypt return null), and callers treat the
// feature as not-configured (503), matching the other gated-integration
// patterns. Payload format: `v1.<iv b64>.<ciphertext b64>.<authTag b64>`.

const ALGO = 'aes-256-gcm'
const VERSION = 'v1'

function loadKey(): Buffer | null {
  const raw = process.env.INTEGRATION_SECRET_KEY
  if (!raw) return null
  try {
    const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
    return buf.length === 32 ? buf : null
  } catch {
    return null
  }
}

/** True when the deployment has a valid encryption key (feature is live). */
export function hasSecretCryptoKey(): boolean {
  return loadKey() !== null
}

/** Encrypt a plaintext secret, or null when no key is configured / input empty. */
export function encryptSecret(plaintext: string): string | null {
  const key = loadKey()
  if (!key || !plaintext) return null
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${VERSION}.${iv.toString('base64')}.${enc.toString('base64')}.${tag.toString('base64')}`
}

/** Decrypt a payload from encryptSecret, or null on any failure (bad key,
 *  tamper, malformed, no key). Never throws. */
export function decryptSecret(payload: string | null | undefined): string | null {
  const key = loadKey()
  if (!key || !payload) return null
  const parts = payload.split('.')
  if (parts.length !== 4 || parts[0] !== VERSION) return null
  try {
    const iv = Buffer.from(parts[1]!, 'base64')
    const enc = Buffer.from(parts[2]!, 'base64')
    const tag = Buffer.from(parts[3]!, 'base64')
    // GCM: a 12-byte IV and a full 16-byte (128-bit) auth tag. Reject anything
    // else up front - a short/forged tag is a tamper attempt, not a real payload.
    if (iv.length !== 12 || tag.length !== 16) return null
    const decipher = crypto.createDecipheriv(ALGO, key, iv, { authTagLength: 16 })
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
