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

/** The bare label to type into a registrar's "Host"/"Name" field. */
export const VERIFICATION_TXT_LABEL = '_nexez-verify'

/**
 * Most registrars (Namecheap, GoDaddy, Cloudflare, Squarespace...) append the zone
 * to whatever goes in the Host field. Pasting the full FQDN therefore creates
 * `_nexez-verify.example.com.example.com`, which resolves fine but is invisible to
 * the check at the real name. This is the single most common verification failure,
 * so we probe for it explicitly and tell the owner exactly what to change.
 */
export function doubledVerificationTxtHost(host: string): string {
  return `_nexez-verify.${host}.${host}`
}

/** Guidance shown when the token was found at the doubled (zone-appended) name. */
export function doubledRecordMessage(host: string): string {
  return (
    `Found your token at ${doubledVerificationTxtHost(host)}. Your DNS provider appended ` +
    `"${host}" to the name automatically. Edit that record and set the Host/Name field to ` +
    `just "${VERIFICATION_TXT_LABEL}" (nothing else), then verify again.`
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
