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
 * for the limit — including the grandfathered baseline — so the v1 routes attempt
 * the write and map this to a 402 rather than duplicating (and drifting from) the
 * limit math in app code.
 */
export function isPageLimitError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '23514' && /published page limit/i.test(error.message ?? '')
}
