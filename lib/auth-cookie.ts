// Supabase stores the session as one or more `sb-<ref>-auth-token` cookies.
// The proxy middleware (host routing) and PlatformFrame (shell selection on the
// dual discovery surfaces) gate on the *presence* of that cookie - a cheap
// heuristic. It can be stale, but that's safe: the real auth gate still validates
// downstream, so a stale cookie merely shows the public-only nav rather than
// granting access. Keep all callers on this one matcher so decisions never drift.
export function hasSupabaseAuthCookie(
  cookies: ReadonlyArray<{ name: string; value?: string }>,
): boolean {
  return cookies.some((c) => /^sb-.*-auth-token/.test(c.name) && Boolean(c.value))
}

/** Client-side variant over document.cookie (the auth cookie is deliberately not
 *  httpOnly — the Supabase client SDK needs it). Used by PlatformFrame so the ROOT
 *  layout never reads cookies() — a request-scoped API there would force every
 *  route in the tree dynamic and kill static prerendering of the marketing site. */
export function hasSupabaseAuthCookieInDocument(): boolean {
  if (typeof document === 'undefined') return false
  return hasSupabaseAuthCookie(
    document.cookie.split(';').map((pair) => {
      const eq = pair.indexOf('=')
      return eq === -1
        ? { name: pair.trim(), value: '' }
        : { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1) }
    }),
  )
}
