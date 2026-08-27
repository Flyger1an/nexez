import 'server-only'
import { createHash, createHmac } from 'node:crypto'

function tokenSecret(): string {
  const secret = process.env.SCAN_LEAD_TOKEN_SECRET?.trim() || process.env.CRON_SECRET?.trim()
  if (secret) return secret
  if (process.env.NODE_ENV !== 'production') return 'nexez-local-scan-lead-token-secret'
  throw new Error('SCAN_LEAD_TOKEN_SECRET or CRON_SECRET is required for scan lead tokens')
}

/**
 * Unsubscribe tokens for emailed scan results.
 *
 * Derived from the lead's row id with a server secret rather than stored in
 * plaintext. Two properties follow from that and both matter:
 *
 *   - The link in an email sent in March still works in September. A token that
 *     was generated per send would be invalidated by the next send, so anyone
 *     unsubscribing from an older message would be told their link is invalid,
 *     which is the exact moment you must not fail.
 *   - The database stores only the hash, so a dump of scan_leads cannot be turned
 *     into working unsubscribe links.
 *
 * A database reader has the id and token hash but not the server secret, so a data
 * export cannot be converted into working unsubscribe links.
 */
export function deriveScanLeadToken(leadId: string): string {
  return createHmac('sha256', tokenSecret())
    .update(`nexez-scan-lead-token-v2:${leadId}`)
    .digest('base64url')
}

/**
 * Opaque handoff token for the scan-to-onboarding funnel. This uses a distinct
 * HMAC namespace from unsubscribe links so the two capabilities cannot be
 * substituted for one another even though they are derived from the same row.
 */
export function deriveScanOnboardingToken(leadId: string): string {
  return createHmac('sha256', tokenSecret())
    .update(`nexez-scan-onboarding-token-v1:${leadId}`)
    .digest('base64url')
}

export function hashScanLeadToken(token: string): string {
  return createHash('sha256').update(`nexez-scan-lead-v1:${token}`).digest('hex')
}

export function isScanLeadToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{40,64}$/.test(token)
}
