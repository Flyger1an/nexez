// G21 - programmatic API keys. Pure helpers (generation, hashing, parsing).
// Security: only the SHA-256 hash is ever stored; the raw key is returned once
// at creation and never persisted server-side.
import { createHash, randomBytes } from 'crypto'

export const API_KEY_PREFIX = 'nxz_live_'

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw.trim()).digest('hex')
}

export function generateApiKey(): { raw: string; prefix: string; keyHash: string } {
  const secret = randomBytes(24).toString('hex') // 48 hex chars
  const raw = `${API_KEY_PREFIX}${secret}`
  return {
    raw,
    prefix: raw.slice(0, API_KEY_PREFIX.length + 4), // e.g. nxz_live_ab12 (safe to display)
    keyHash: hashApiKey(raw),
  }
}

/** Extract a Nexez API key from an Authorization header (with or without "Bearer "). */
export function parseBearer(header: string | null | undefined): string | null {
  if (!header) return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  const token = (match ? match[1]! : header).trim()
  return token.startsWith(API_KEY_PREFIX) ? token : null
}

export function isValidApiKeyFormat(raw: string | null | undefined): boolean {
  return typeof raw === 'string' && raw.startsWith(API_KEY_PREFIX) && raw.length >= API_KEY_PREFIX.length + 32
}
