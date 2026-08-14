import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// The malformed-path guard returns before any of these are reached; they are
// mocked so the module graph stays hermetic and so "was any work done?" is
// observable.
vi.mock('./utils/supabase/middleware', () => ({
  updateSession: vi.fn(async () => NextResponse.next()),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    from: () => {
      const builder: any = {
        select: () => builder,
        in: () => builder,
        eq: () => builder,
        not: () => builder,
        returns: () => Promise.resolve({ data: [] }),
      }
      return builder
    },
  })),
}))

import { NextRequest } from 'next/server'
import { proxy } from './proxy'
import { updateSession } from './utils/supabase/middleware'
import { createServerClient } from '@supabase/ssr'

const request = (url: string, host: string) =>
  new NextRequest(url, { headers: { host } })

// Seven production runtime error groups came from a trailing encoded backslash:
//   /agent.json%5C -> Cannot find module './.next/server/pages/agent.json%5C.js'
// The path reached the Next.js launcher, which threw MODULE_NOT_FOUND instead of
// answering 404. Nothing in this repo emits these URLs, so the fix is to fail
// gracefully at the edge rather than to stop producing them.
describe('proxy: malformed artifact paths', () => {
  beforeEach(() => vi.clearAllMocks())

  const malformed = [
    'https://nexez.app/agent.json%5C',
    'https://nexez.app/agent-pages.json%5C',
    'https://nexez.app/.well-known/nexez.json%5C',
  ]

  it.each(malformed)('404s %s cleanly, without throwing', async (url) => {
    const res = await proxy(request(url, 'nexez.app'))
    expect(res.status).toBe(404)
  })

  it('does no work before rejecting: no session refresh, no domain lookup', async () => {
    await proxy(request('https://nexez.app/agent.json%5C', 'nexez.app'))
    expect(updateSession).not.toHaveBeenCalled()
    expect(createServerClient).not.toHaveBeenCalled()
  })

  it('404s on a custom domain too, rather than redirecting to the canonical host', async () => {
    const res = await proxy(request('https://agents.acme.com/agent.json%5C', 'agents.acme.com'))
    expect(res.status).toBe(404)
    expect(createServerClient).not.toHaveBeenCalled()
  })

  it('rejects encoded control characters and undecodable sequences', async () => {
    expect((await proxy(request('https://nexez.app/agent.json%00', 'nexez.app'))).status).toBe(404)
    expect((await proxy(request('https://nexez.app/agent.json%ZZ', 'nexez.app'))).status).toBe(404)
  })

  it('leaves a clean path alone: the guard is not over-broad', async () => {
    // An unmapped custom domain 308s to the canonical host. The assertion that
    // matters is that this is NOT the guard's 404.
    const res = await proxy(request('https://agents.acme.com/agent.json', 'agents.acme.com'))
    expect(res.status).not.toBe(404)
    expect(createServerClient).toHaveBeenCalled()
  })
})
