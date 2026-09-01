const DEFAULT_RETRY_DELAYS_MS = [0, 80, 160, 320, 640, 1_280, 2_560, 4_000] as const

export const AUTH_SESSION_PROBE_PATH = '/api/auth/session'

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type WaitForServerAuthSessionOptions = {
  fetcher?: Fetcher
  sleep?: (milliseconds: number) => Promise<void>
  retryDelaysMs?: readonly number[]
}

/**
 * Verify that the SSR auth boundary can read the browser session before a
 * client-side sign-in redirects into server-rendered dashboard routes.
 */
export async function probeServerAuthSession(
  fetcher: Fetcher = globalThis.fetch.bind(globalThis),
): Promise<boolean> {
  const response = await fetcher(AUTH_SESSION_PROBE_PATH, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  })
  return response.status === 204
}

export async function waitForServerAuthSession(
  options: WaitForServerAuthSessionOptions = {},
): Promise<boolean> {
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis)
  const sleep = options.sleep ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))
  const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS

  for (const delay of retryDelaysMs) {
    if (delay > 0) await sleep(delay)
    try {
      if (await probeServerAuthSession(fetcher)) return true
    } catch {
      // Navigation and local dev-server startup can briefly interrupt the probe.
      // Keep retrying inside the bounded schedule rather than treating that as an
      // authenticated session or allowing an unbounded wait.
    }
  }

  return false
}
