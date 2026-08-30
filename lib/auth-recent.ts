const NON_INTERACTIVE_AUTH_METHODS = new Set([
  'anonymous',
  'email_change',
  'email/signup',
  'invite',
  'token_refresh',
])

export const RECENT_AUTH_WINDOW_SECONDS = 10 * 60

type AuthenticationMethodReference = {
  method?: unknown
  timestamp?: unknown
}

/**
 * A refreshed JWT has a new `iat`, so it cannot prove that the person recently
 * authenticated. Supabase preserves the interactive authentication timestamp in
 * the signed `amr` claim; destructive account actions must use that timestamp.
 */
export function hasRecentInteractiveAuthentication(
  claims: unknown,
  nowSeconds = Math.floor(Date.now() / 1000),
  windowSeconds = RECENT_AUTH_WINDOW_SECONDS,
): boolean {
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) return false
  const amr = (claims as { amr?: unknown }).amr
  if (!Array.isArray(amr)) return false

  return amr.some((entry: AuthenticationMethodReference) => {
    if (!entry || typeof entry !== 'object') return false
    const method = typeof entry.method === 'string' ? entry.method.trim().toLowerCase() : ''
    const timestamp = typeof entry.timestamp === 'number' ? entry.timestamp : Number.NaN
    if (!method || NON_INTERACTIVE_AUTH_METHODS.has(method) || !Number.isFinite(timestamp)) return false

    const ageSeconds = nowSeconds - timestamp
    return ageSeconds >= -60 && ageSeconds <= windowSeconds
  })
}
