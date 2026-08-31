const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on'])

type A2AStreamingEnv = {
  A2A_STREAMING_ENABLED?: string
}

/**
 * One capability switch controls both transport availability and Agent Card
 * advertising so discovery can never promise a stream the route will reject.
 */
export function a2aStreamingEnabled(
  env: A2AStreamingEnv = {
    A2A_STREAMING_ENABLED: process.env.A2A_STREAMING_ENABLED,
  },
): boolean {
  const raw = env.A2A_STREAMING_ENABLED?.trim().toLowerCase()
  return raw ? ENABLED_VALUES.has(raw) : false
}
