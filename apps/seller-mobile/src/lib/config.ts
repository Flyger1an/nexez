function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabasePublishableKey:
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    '',
  apiUrl: trimTrailingSlash(process.env.EXPO_PUBLIC_NEXEZ_API_URL ?? 'https://nexez.app'),
  agentRuntimeUrl: trimTrailingSlash(
    process.env.EXPO_PUBLIC_AGENT_RUNTIME_URL ??
      process.env.EXPO_PUBLIC_NEXEZ_API_URL ??
      'https://nexez.app',
  ),
}

export const isSupabaseConfigured = Boolean(config.supabaseUrl && config.supabasePublishableKey)

export function publicPageUrl(slug: string) {
  return `${config.agentRuntimeUrl}/${slug.replace(/^\/+/, '')}`
}
