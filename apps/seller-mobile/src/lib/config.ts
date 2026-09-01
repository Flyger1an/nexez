function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

/** Authed API calls MUST target the app host. Under the 3-host split the
 *  proxy 308-canonicalizes /api/* on nexez.app → app.nexez.ai, and RN's fetch
 *  mishandles the cross-host redirect (drops Authorization / stalls) - every
 *  Bearer call silently breaks. Found by the on-device intake pass; normalize
 *  the known-wrong runtime host so a stale env can't reintroduce it. */
function normalizeApiHost(value: string) {
  const trimmed = trimTrailingSlash(value)
  return trimmed === 'https://nexez.app' || trimmed === 'https://www.nexez.app' ? 'https://app.nexez.ai' : trimmed
}

export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabasePublishableKey:
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    '',
  apiUrl: normalizeApiHost(process.env.EXPO_PUBLIC_NEXEZ_API_URL ?? 'https://app.nexez.ai'),
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
  releaseStage:
    process.env.EXPO_PUBLIC_RELEASE_STAGE ??
    (typeof __DEV__ !== 'undefined' && __DEV__ ? 'development' : 'production'),
  // Public agent surfaces (published pages, agent.json links) stay on the
  // agent-runtime host - only the authed API moves to the app host.
  agentRuntimeUrl: trimTrailingSlash(process.env.EXPO_PUBLIC_AGENT_RUNTIME_URL ?? 'https://nexez.app'),
}

export const isSupabaseConfigured = Boolean(config.supabaseUrl && config.supabasePublishableKey)

// Fail LOUD, not silent. The Supabase client falls back to a placeholder URL so
// the JS bundle still boots (see supabase.ts), which means a build shipped with
// missing EXPO_PUBLIC_* env used to just silently fail every request with no
// hint why. Surface exactly which required vars are absent, and in a dev build
// throw so it's impossible to miss; in a release build log an error so a
// mis-provisioned store build is diagnosable from the logs (crashing every
// user on launch would be worse than the login screen's degraded-state notice).
export const configErrors: string[] = [
  ['EXPO_PUBLIC_SUPABASE_URL', config.supabaseUrl],
  ['EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', config.supabasePublishableKey],
].flatMap(([name, value]) => (value ? [] : [`${name} is not set`]))

if (configErrors.length) {
  const message = `[nexez-config] missing required env: ${configErrors.join(', ')}`
  // __DEV__ is injected by the Expo/RN bundler.
  if (typeof __DEV__ !== 'undefined' && __DEV__) throw new Error(message)
  console.error(message)
}

export function publicPageUrl(slug: string) {
  return `${config.agentRuntimeUrl}/${slug.replace(/^\/+/, '')}`
}
