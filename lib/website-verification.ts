// Pure helpers for external-website ownership verification (Plugin Pivot Phase 1).
// A listing owner proves control of the host in pages.website_url via one of three
// methods; the route does the DNS lookup / fetch and calls these matchers.

// Distinct prefix from the custom-domain flow's `nexez-verify-` so the two flows'
// TXT values never cross-match on the shared `_nexez-verify.<host>` record name.
export const WEBSITE_TOKEN_PREFIX = 'nexez-site-verify-'

const HEX = '0123456789abcdef'

/** 24 hex chars of CSPRNG entropy behind the prefix. Browser + Node safe. */
export function generateWebsiteVerificationToken(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  let hex = ''
  for (const b of bytes) hex += HEX[(b >> 4) & 0xf] + HEX[b & 0xf]
  return WEBSITE_TOKEN_PREFIX + hex
}

/** True for a well-formed token this system could have issued. */
export function isWellFormedWebsiteToken(token: string | null | undefined): boolean {
  if (typeof token !== 'string') return false
  if (!token.startsWith(WEBSITE_TOKEN_PREFIX)) return false
  const body = token.slice(WEBSITE_TOKEN_PREFIX.length)
  return /^[0-9a-f]{16,64}$/.test(body)
}

/** Lowercased hostname of a website URL, or null when unparseable/non-http. */
export function websiteHostOf(websiteUrl: string | null | undefined): string | null {
  if (typeof websiteUrl !== 'string' || !websiteUrl.trim()) return null
  let raw = websiteUrl.trim()
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`
  try {
    const u = new URL(raw)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    const host = u.hostname.toLowerCase()
    return host && host.includes('.') ? host : null
  } catch {
    return null
  }
}

/** DNS record name owners add the TXT to (same convention as the custom-domain flow). */
export function verificationTxtHost(host: string): string {
  return `_nexez-verify.${host}`
}

/** The leading label of the verification record, before the host. */
export const VERIFICATION_TXT_LABEL = '_nexez-verify'

/**
 * Most registrars (Namecheap, GoDaddy, Cloudflare, Squarespace...) append the DNS
 * ZONE to whatever goes in the Host field. Pasting the full record name therefore
 * creates a doubled name that resolves fine but is invisible to the check at the
 * real name. This is the single most common verification failure.
 *
 * The appended suffix is the zone, NOT necessarily the host: for a site at the
 * apex (kismetpros.com) the doubled name is `_nexez-verify.kismetpros.com.kismetpros.com`,
 * but for a site on a subdomain (shop.example.com in zone example.com) it is
 * `_nexez-verify.shop.example.com.example.com`. We cannot know the zone up front,
 * so we generate one candidate per possible parent zone and probe each.
 */
export function doubledVerificationTxtCandidates(host: string): Array<{ doubledHost: string; zone: string }> {
  const labels = host.split('.').filter(Boolean)
  const candidates: Array<{ doubledHost: string; zone: string }> = []
  // Every suffix with at least two labels is a plausible zone (example.com,
  // shop.example.com, ...). Longest first so the most specific zone wins.
  for (let i = 0; i <= labels.length - 2; i += 1) {
    const zone = labels.slice(i).join('.')
    candidates.push({ doubledHost: `${verificationTxtHost(host)}.${zone}`, zone })
  }
  return candidates
}

/**
 * The value to type into a registrar's Host/Name field, given the zone that
 * provider appends. Apex site: `_nexez-verify`. Subdomain site: `_nexez-verify.shop`.
 */
export function verificationTxtLabelForZone(host: string, zone: string): string {
  const full = verificationTxtHost(host)
  if (zone && full.endsWith(`.${zone}`)) return full.slice(0, -1 * (zone.length + 1))
  return full
}

/** Back-compat helper: the apex-zone candidate. */
export function doubledVerificationTxtHost(host: string): string {
  return `${verificationTxtHost(host)}.${host}`
}

/**
 * Guidance shown when the token was found at a doubled (zone-appended) name.
 * The zone is evidence, not a guess: it comes from whichever candidate matched,
 * so the label below is exact for both apex and subdomain sites.
 */
export function doubledRecordMessage(host: string, zone: string = host): string {
  const label = verificationTxtLabelForZone(host, zone)
  return (
    `Found your token at ${verificationTxtHost(host)}.${zone}. Your DNS provider appended ` +
    `"${zone}" to the name automatically. Edit that record and set the Host/Name field to ` +
    `just "${label}" (nothing else), then verify again.`
  )
}

/** The exact `.well-known` file path merchants publish for file verification. */
export const WELL_KNOWN_VERIFY_PATH = '/.well-known/nexez-verify.txt'

/** The exact `<meta>` tag merchants paste into their site <head>. */
export function verificationMetaTag(token: string): string {
  return `<meta name="nexez-site-verification" content="${token}">`
}

/**
 * Does the HTML contain <meta name="nexez-site-verification" content="TOKEN">?
 * Tolerant of attribute order + single/double quotes; requires an EXACT token
 * match (a token that is only a substring/prefix of the content must NOT pass).
 */
export function matchesVerificationMeta(html: string, token: string): boolean {
  if (!html || !token) return false
  const metaTags = html.match(/<meta\b[^>]*>/gi)
  if (!metaTags) return false
  for (const tag of metaTags) {
    const name = tag.match(/\bname\s*=\s*["']([^"']*)["']/i)?.[1]
    if (!name || name.toLowerCase() !== 'nexez-site-verification') continue
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1]
    if (content != null && content.trim() === token) return true
  }
  return false
}

/** Does any trimmed line of the file equal the token exactly? */
export function matchesVerificationFile(text: string, token: string): boolean {
  if (!text || !token) return false
  return text.split(/\r?\n/).some((line) => line.trim() === token)
}
