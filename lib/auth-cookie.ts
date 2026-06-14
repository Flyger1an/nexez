// Supabase stores the session as one or more `sb-<ref>-auth-token` cookies.
// Both the proxy middleware (host routing) and the root layout (shell selection)
// gate on the *presence* of that cookie — a cheap, edge-safe heuristic. It can be
// stale, but that's safe: the real auth gate still validates downstream, so a
// stale cookie merely shows the public-only nav rather than granting access.
// Keep both callers on this one matcher so their decisions never drift.
export function hasSupabaseAuthCookie(
  cookies: ReadonlyArray<{ name: string; value?: string }>,
): boolean {
  return cookies.some((c) => /^sb-.*-auth-token/.test(c.name) && Boolean(c.value))
}
