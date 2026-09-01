import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refs = vi.hoisted(() => ({
  createBrowserClient: vi.fn(),
  getBrowserSupabaseCookieOptions: vi.fn(),
  waitForServerAuthSession: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({ createBrowserClient: refs.createBrowserClient }))
vi.mock('./cookie-options', () => ({
  getBrowserSupabaseCookieOptions: refs.getBrowserSupabaseCookieOptions,
}))
vi.mock('../../lib/browser-auth-readiness', () => ({
  waitForServerAuthSession: refs.waitForServerAuthSession,
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubGlobal('window', { location: { hostname: '127.0.0.1' } })
  refs.getBrowserSupabaseCookieOptions.mockReturnValue(undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function mockClient(options: {
  session?: boolean
  error?: Error | null
} = {}) {
  const signInWithPassword = vi.fn(async () => ({
    data: {
      user: options.session === false ? null : { id: 'user-1' },
      session: options.session === false ? null : { access_token: 'token' },
    },
    error: options.error ?? null,
  }))
  const refreshSession = vi.fn(async () => ({
    data: { user: { id: 'user-1' }, session: { access_token: 'refreshed' } },
    error: null,
  }))
  const client = { auth: { signInWithPassword, refreshSession } }
  refs.createBrowserClient.mockReturnValue(client)
  return { client, signInWithPassword, refreshSession }
}

describe('createClient password auth readiness barrier', () => {
  it('waits until the server recognizes a successful browser session', async () => {
    const { signInWithPassword, refreshSession } = mockClient()
    refs.waitForServerAuthSession.mockResolvedValue(true)
    const { createClient } = await import('./client')

    const client = createClient()
    await client.auth.signInWithPassword({ email: 'buyer@example.com', password: 'secret' })

    expect(signInWithPassword).toHaveBeenCalledTimes(1)
    expect(refs.waitForServerAuthSession).toHaveBeenCalledTimes(1)
    expect(refreshSession).not.toHaveBeenCalled()
  })

  it('refreshes once and probes again when the first server-readiness window expires', async () => {
    const { refreshSession } = mockClient()
    refs.waitForServerAuthSession
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    const { createClient } = await import('./client')

    const client = createClient()
    await client.auth.signInWithPassword({ email: 'buyer@example.com', password: 'secret' })

    expect(refreshSession).toHaveBeenCalledTimes(1)
    expect(refs.waitForServerAuthSession).toHaveBeenCalledTimes(2)
  })

  it('does not probe or refresh after a rejected password sign-in', async () => {
    const { refreshSession } = mockClient({ session: false, error: new Error('Invalid login') })
    const { createClient } = await import('./client')

    const client = createClient()
    await client.auth.signInWithPassword({ email: 'buyer@example.com', password: 'wrong' })

    expect(refs.waitForServerAuthSession).not.toHaveBeenCalled()
    expect(refreshSession).not.toHaveBeenCalled()
  })

  it('returns one patched browser client instead of stacking readiness wrappers', async () => {
    const { client, signInWithPassword } = mockClient()
    refs.waitForServerAuthSession.mockResolvedValue(true)
    const { createClient } = await import('./client')

    expect(createClient()).toBe(client)
    expect(createClient()).toBe(client)
    await client.auth.signInWithPassword({ email: 'buyer@example.com', password: 'secret' })

    expect(signInWithPassword).toHaveBeenCalledTimes(1)
    expect(refs.waitForServerAuthSession).toHaveBeenCalledTimes(1)
  })
})
