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
  // Public agent surfaces (published pages, agent.json links) stay on the
  // agent-runtime host - only the authed API moves to the app host.
  agentRuntimeUrl: trimTrailingSlash(process.env.EXPO_PUBLIC_AGENT_RUNTIME_URL ?? 'https://nexez.app'),
}

export const isSupabaseConfigured = Boolean(config.supabaseUrl && config.supabasePublishableKey)

export function publicPageUrl(slug: string) {
  return `${config.agentRuntimeUrl}/${slug.replace(/^\/+/, '')}`
}
