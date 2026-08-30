export const ACCOUNT_WEB_HANDOFFS = {
  apiKeys: '/dashboard/tools',
  customDomains: '/dashboard/settings#agent-surfaces',
  profileSecurity: '/dashboard/settings#security',
  team: '/dashboard/settings#team',
  data: '/dashboard/settings#data',
} as const

/**
 * Authenticate the external browser first, then enter the signed-in Agent Lab
 * lens. A direct `/simulator` link would show the anonymous marketing surface
 * when the native app's Supabase session is not present in browser cookies.
 */
export const COMPETITOR_ANALYSIS_WEB_HANDOFF = '/login?next=%2Fsimulator%3Fmode%3Dcompare' as const

export type ImporterHandoffResult =
  | { ok: true; path: string; sourceUrl: string }
  | { ok: false; message: string }

/** Build the canonical web create handoff without dropping the entered URL. */
export function buildImporterHandoff(rawValue: string): ImporterHandoffResult {
  const value = rawValue.trim()
  if (!value) return { ok: false, message: 'Enter a website URL.' }

  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(value)
  const candidate = hasScheme ? value : `https://${value}`

  let sourceUrl: URL
  try {
    sourceUrl = new URL(candidate)
  } catch {
    return { ok: false, message: 'Enter a valid website URL.' }
  }

  if (!['http:', 'https:'].includes(sourceUrl.protocol)) {
    return { ok: false, message: 'Use an HTTP or HTTPS website URL.' }
  }
  if (!sourceUrl.hostname || sourceUrl.username || sourceUrl.password) {
    return { ok: false, message: 'Enter a public website URL without sign-in details.' }
  }

  const normalizedUrl = sourceUrl.toString()
  return {
    ok: true,
    sourceUrl: normalizedUrl,
    path: `/create?url=${encodeURIComponent(normalizedUrl)}`,
  }
}
