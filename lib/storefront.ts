// Storefront = the account-level brand entity that aggregates a seller's published
// listings at /store/<handle> (STOREFRONT_RENAME.md §5). 1 account = 1 storefront for
// now. Public reads go through the service-role client in the /store route; this module
// holds the shared type + the pure handle normalizer (used by Storefront settings).

export type Storefront = {
  id: string
  owner_id: string
  handle: string
  display_name: string | null
  description: string | null
  logo_url: string | null
  accent_color: string | null
  created_at?: string
  updated_at?: string
}

export const HANDLE_MAX = 63

/**
 * Normalize a user-entered storefront handle to the DB-safe form (matches the
 * `storefronts_handle_format` CHECK: ^[a-z0-9-]+$, 1–63 chars) with no leading, trailing,
 * or doubled hyphens. Returns '' when nothing usable remains (caller rejects empty).
 */
export function normalizeHandle(input: unknown): string {
  if (typeof input !== 'string') return ''
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // collapse any run of non-alphanumerics to one hyphen
    .replace(/^-+/, '') // trim leading hyphens
    .replace(/-+$/, '') // trim trailing hyphens
    .slice(0, HANDLE_MAX)
    .replace(/-+$/, '') // re-trim if the slice cut mid-hyphen
}

/** True when a handle is already in the canonical, DB-valid form. */
export function isValidHandle(handle: string): boolean {
  return handle.length > 0 && handle.length <= HANDLE_MAX && normalizeHandle(handle) === handle
}
