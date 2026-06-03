// C10 — white-label branding for public agent pages (esp. on custom domains).
// All values are validated/sanitized here because they render into the public
// page (accent color into inline style, logo into <img src>): we never let raw
// user input become a style or URL without passing these guards.

export type PageBranding = {
  accent_color: string | null
  logo_url: string | null
  brand_name: string | null
  hide_nexez_badge: boolean
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** Only accept a strict hex color, so it can't break out of an inline style. */
export function sanitizeAccentColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  return HEX_COLOR.test(v) ? v : null
}

/** Only accept absolute http(s) URLs for the logo (no javascript:, data:, etc.). */
export function sanitizeLogoUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (!v) return null
  try {
    const u = new URL(v)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

function sanitizeBrandName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim().slice(0, 80)
  return v || null
}

/** Normalize a raw `branding` JSONB blob into a safe, typed shape. */
export function normalizeBranding(raw: unknown): PageBranding {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    accent_color: sanitizeAccentColor(b.accent_color),
    logo_url: sanitizeLogoUrl(b.logo_url),
    brand_name: sanitizeBrandName(b.brand_name),
    hide_nexez_badge: b.hide_nexez_badge === true,
  }
}

/** True when any branding has actually been configured. */
export function hasBranding(b: PageBranding): boolean {
  return Boolean(b.accent_color || b.logo_url || b.brand_name || b.hide_nexez_badge)
}
