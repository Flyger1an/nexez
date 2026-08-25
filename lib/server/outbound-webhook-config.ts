import 'server-only'
import { decryptSecret, encryptSecret } from './secret-crypto'
import { getWebhookEndpointError } from '../webhooks'

export const MAX_OUTBOUND_WEBHOOKS = 10
const MAX_WEBHOOK_URL_LENGTH = 2048
const MAX_WEBHOOK_SECRET_LENGTH = 512

export type ClientOutboundWebhook = {
  url: string
  hasSecret?: boolean
}

export type StoredOutboundWebhook = string | {
  url?: unknown
  secret?: unknown
}

export type DeliverableOutboundWebhook = {
  url: string
  secret: string | null
}

function storedUrl(value: StoredOutboundWebhook): string {
  return (typeof value === 'string' ? value : typeof value?.url === 'string' ? value.url : '').trim()
}

function storedSecret(value: StoredOutboundWebhook): string | null {
  if (typeof value === 'string' || typeof value?.secret !== 'string') return null
  return value.secret.trim() || null
}

/** Decrypt a current ciphertext while retaining a controlled read path for
 * legacy plaintext rows. New and re-saved secrets are always encrypted. */
export function resolveOutboundWebhookSecret(value: string | null | undefined): string | null {
  if (!value) return null
  const decrypted = decryptSecret(value)
  if (decrypted) return decrypted
  return value.startsWith('v1.') ? null : value
}

export function protectOutboundWebhookSecret(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_WEBHOOK_SECRET_LENGTH) return null
  if (decryptSecret(trimmed)) return trimmed
  return encryptSecret(trimmed)
}

export function outboundWebhooksForClient(value: unknown): ClientOutboundWebhook[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: ClientOutboundWebhook[] = []
  for (const raw of value as StoredOutboundWebhook[]) {
    const url = storedUrl(raw)
    if (!url || seen.has(url)) continue
    seen.add(url)
    result.push({ url, ...(storedSecret(raw) ? { hasSecret: true } : {}) })
  }
  return result
}

export function outboundWebhooksForDelivery(value: unknown): DeliverableOutboundWebhook[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: DeliverableOutboundWebhook[] = []
  for (const raw of value as StoredOutboundWebhook[]) {
    const url = storedUrl(raw)
    if (!url || seen.has(url)) continue
    seen.add(url)
    result.push({ url, secret: resolveOutboundWebhookSecret(storedSecret(raw)) })
  }
  return result
}

export type SealOutboundWebhookResult =
  | { ok: true; value: Array<{ url: string; secret?: string }> }
  | { ok: false; error: string; configurationError?: boolean }

/** Validate a browser-submitted endpoint list, encrypt new signing secrets,
 * and preserve the stored secret when the browser only received hasSecret. */
export function sealOutboundWebhooks(incoming: unknown, existing: unknown): SealOutboundWebhookResult {
  if (!Array.isArray(incoming)) return { ok: false, error: 'Outbound webhooks must be an array.' }
  if (incoming.length > MAX_OUTBOUND_WEBHOOKS) {
    return { ok: false, error: `Add no more than ${MAX_OUTBOUND_WEBHOOKS} webhook endpoints per listing.` }
  }

  const existingByUrl = new Map<string, string | null>()
  if (Array.isArray(existing)) {
    for (const raw of existing as StoredOutboundWebhook[]) {
      const url = storedUrl(raw)
      if (url) existingByUrl.set(url, storedSecret(raw))
    }
  }

  const seen = new Set<string>()
  const value: Array<{ url: string; secret?: string }> = []
  for (const raw of incoming as Array<string | { url?: unknown; secret?: unknown; hasSecret?: unknown }>) {
    const url = (typeof raw === 'string' ? raw : typeof raw?.url === 'string' ? raw.url : '').trim()
    if (!url || url.length > MAX_WEBHOOK_URL_LENGTH) return { ok: false, error: 'Enter a valid webhook URL.' }
    const endpointError = getWebhookEndpointError(url)
    if (endpointError) return { ok: false, error: endpointError }
    if (seen.has(url)) continue
    seen.add(url)

    const submittedSecret = typeof raw === 'object' && raw && typeof raw.secret === 'string'
      ? raw.secret.trim()
      : ''
    const preserveExisting = typeof raw === 'object' && raw && raw.hasSecret === true
    const candidate = submittedSecret || (preserveExisting ? existingByUrl.get(url) || '' : '')
    if (!candidate) {
      value.push({ url })
      continue
    }
    const protectedSecret = protectOutboundWebhookSecret(candidate)
    if (!protectedSecret) {
      return {
        ok: false,
        error: submittedSecret.length > MAX_WEBHOOK_SECRET_LENGTH
          ? `Signing secrets must be ${MAX_WEBHOOK_SECRET_LENGTH} characters or fewer.`
          : 'Webhook signing-secret encryption is not configured.',
        configurationError: submittedSecret.length <= MAX_WEBHOOK_SECRET_LENGTH,
      }
    }
    value.push({ url, secret: protectedSecret })
  }

  return { ok: true, value }
}
