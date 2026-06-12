// Same-origin guard for post-auth `next` redirects.
//
// Both the server auth callback (app/auth/callback/route.ts) and the client login
// form (components/LoginForm.tsx) read a `next` value from the query string and
// redirect to it after sign-in. Without validation that is a classic OPEN REDIRECT:
// `?next=https://evil.example` (or protocol-relative `//evil.example`) sends the
// freshly-authenticated user to an attacker host — a phishing / OAuth-landing vector.
//
// Accept ONLY a same-origin absolute path. Reject absolute URLs, protocol-relative
// (`//host`, `/\host`), and anything not starting with a single `/`. The result is
// always safe to pass to `new URL(next, origin)` or assign to `location.href`.
export function safeNextPath(raw: string | null | undefined, fallback = '/dashboard'): string {
  if (typeof raw !== 'string' || raw.length === 0) return fallback
  // Must be an absolute path on the current origin.
  if (raw[0] !== '/') return fallback
  // Reject protocol-relative forms a browser would treat as a host: `//evil`, `/\evil`.
  if (raw[1] === '/' || raw[1] === '\\') return fallback
  return raw
}
