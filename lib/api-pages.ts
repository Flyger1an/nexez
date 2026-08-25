import { normalizeCurrency } from './currency'
import { isEntitlementAllocationRetry } from './entitlement-allocation-error'

export { isEntitlementAllocationRetry }

// Shared field whitelist for the programmatic page API (single source for both
// the collection and item routes).
export const WRITABLE_PAGE_FIELDS = [
  'name',
  'description',
  'website_url',
  'cta_url',
  'cta_label',
  'audience',
  'location',
  'contact_email',
  'industry',
  'prefer_original_site',
  'products',
  'services',
  'faqs',
  'is_published',
  'custom_domain',
  'domain_path',
  'currency',
] as const

/** Pick only client-writable fields from an arbitrary request body. */
export function pickWritablePageFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of WRITABLE_PAGE_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key]
  }
  // Persist only a supported, normalized currency code (never a raw/invalid value).
  if (out.currency !== undefined) out.currency = normalizeCurrency(out.currency as string)
  return out
}

/**
 * True when a write is trying to SET a non-empty custom domain / domain path
 * (attaching a domain is the `customDomain` Launch+ capability). Clearing it
 * (empty string / null) is always allowed so a downgraded owner can detach.
 */
export function wantsCustomDomain(fields: Record<string, unknown>): boolean {
  const nonEmpty = (v: unknown) => typeof v === 'string' && v.trim() !== ''
  return nonEmpty(fields.custom_domain) || nonEmpty(fields.domain_path)
}

/**
 * True when a Supabase write error is the published-page-limit trigger firing
 * (SQLSTATE 23514 / its message). The DB trigger is the single source of truth
 * for the exact canonical allocation, so the v1 routes attempt the write and map
 * this to a 402 rather than duplicating (and drifting from) the limit math.
 */
export function isPageLimitError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '23514' && /published page limit/i.test(error.message ?? '')
}

export type CustomDomainWriteConflict = {
  code: 'custom_domain_claimed' | 'custom_domain_reserved' | 'custom_domain_claim_lost'
  error: string
}

/**
 * Convert only canonical custom-domain claim failures into stable API errors.
 * Other unique violations keep their normal validation response so an
 * unrelated constraint can never masquerade as a domain lifecycle conflict.
 */
export function getCustomDomainWriteConflict(
  error: { message?: string } | null | undefined,
): CustomDomainWriteConflict | null {
  const message = error?.message ?? ''
  if (/custom domain is already connected to another Nexez account/i.test(message)) {
    return {
      code: 'custom_domain_claimed',
      error: 'This custom domain is already connected to another Nexez account.',
    }
  }
  if (/custom domain is temporarily reserved/i.test(message)) {
    return {
      code: 'custom_domain_reserved',
      error: 'This custom domain is temporarily reserved while another Nexez account finishes setup.',
    }
  }
  if (/listing no longer owns the custom-domain claim/i.test(message)) {
    return {
      code: 'custom_domain_claim_lost',
      error: 'This listing no longer holds the custom-domain reservation.',
    }
  }
  return null
}
