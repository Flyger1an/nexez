import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { NextResponse } from 'next/server'

const { supabaseRef } = vi.hoisted(() => ({
  // What the pages_public lookup resolves (or rejects) with, per test.
  supabaseRef: {
    respond: async (): Promise<{ data: unknown; error: unknown }> => ({ data: [], error: null }),
    eqs: [] as Array<[string, unknown]>,
  },
}))

// updateSession is only reached on platform hosts; mocking it keeps the module
// graph hermetic and makes "was any work done?" observable.
vi.mock('./utils/supabase/middleware', () => ({
  updateSession: vi.fn(async () => NextResponse.next()),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    from: () => {
      const builder: any = {
        select: () => builder,
        in: () => builder,
        eq: (column: string, value: unknown) => (supabaseRef.eqs.push([column, value]), builder),
        not: () => builder,
        returns: () => supabaseRef.respond(),
      }
      return builder
    },
  })),
}))

import { NextRequest } from 'next/server'
import { proxy } from './proxy'
import { updateSession } from './utils/supabase/middleware'
import { createServerClient } from '@supabase/ssr'

const request = (url: string, host: string) => new NextRequest(url, { headers: { host } })

/** Next signals a middleware rewrite with this header; null means no rewrite happened. */
const rewriteTarget = (res: Response) => res.headers.get('x-middleware-rewrite')

const rows = (data: Array<{ slug: string; domain_path: string | null }>) => async () => ({
  data,
  error: null,
})

describe('proxy: dual-surface APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabaseRef.respond = rows([])
    supabaseRef.eqs = []
  })

  it.each(['nexez.ai', 'app.nexez.ai'])(
    'keeps Agent Lab runs same-origin on %s',
    async (host) => {
      const res = await proxy(request(`https://${host}/api/simulator/runs`, host))

      expect(res.status).toBe(200)
      expect(res.headers.get('location')).toBeNull()
      expect(updateSession).toHaveBeenCalledOnce()
    },
  )
})

// Seven production runtime error groups came from a trailing encoded backslash:
//   /agent.json%5C -> Cannot find module './.next/server/pages/agent.json%5C.js'
// The path reached the Next.js launcher, which threw MODULE_NOT_FOUND instead of
// answering 404. Nothing in this repo emits these URLs, so the fix is to fail
// gracefully at the edge rather than to stop producing them.
describe('proxy: malformed artifact paths', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabaseRef.respond = rows([])
    supabaseRef.eqs = []
  })

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
    const res = await proxy(request('https://malformed.example.com/agent.json%5C', 'malformed.example.com'))
    expect(res.status).toBe(404)
    expect(createServerClient).not.toHaveBeenCalled()
  })

  it('rejects encoded control characters and undecodable sequences', async () => {
    expect((await proxy(request('https://nexez.app/agent.json%00', 'nexez.app'))).status).toBe(404)
    expect((await proxy(request('https://nexez.app/agent.json%ZZ', 'nexez.app'))).status).toBe(404)
  })

  it('leaves a clean path alone: the guard is not over-broad', async () => {
    // An unmapped custom domain 308s to the canonical host. What matters is that
    // this is NOT the guard's 404.
    const res = await proxy(request('https://clean.example.com/agent.json', 'clean.example.com'))
    expect(res.status).not.toBe(404)
    expect(createServerClient).toHaveBeenCalled()
  })
})

// Routing a custom host is an authorization decision: verification, the owner's
// plan allocation, and public-serving state can all be revoked independently of
// DNS. A process-local positive cache used to continue serving the old listing for
// its TTL and, during database failures, could preserve that stale grant forever.
describe('proxy: authoritative custom-domain routing', () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    supabaseRef.respond = rows([])
    supabaseRef.eqs = []
  })

  // Restore only this spy. vi.restoreAllMocks() would also reset the
  // module mocks defined above, taking createServerClient's implementation with it.
  afterEach(() => {
    warn.mockRestore()
  })

  const prime = async (host: string, slug: string) => {
    supabaseRef.respond = rows([{ slug, domain_path: '/' }])
    const res = await proxy(request(`https://${host}/`, host))
    expect(rewriteTarget(res)).toContain(`/${slug}`)
  }

  const failWith = (err: unknown) => {
    supabaseRef.respond = async () => {
      throw err
    }
  }

  it('revalidates every request and stops routing immediately when the public allocation disappears', async () => {
    const host = 'revoked.example.com'
    await prime(host, 'acme')

    vi.mocked(createServerClient).mockClear()
    supabaseRef.respond = rows([]) // downgrade, unverify, or reallocation masks the domain
    const res = await proxy(request(`https://${host}/`, host))

    expect(createServerClient).toHaveBeenCalledOnce()
    expect(rewriteTarget(res)).toBeNull()
    expect(res.status).toBe(308)
    expect(res.headers.get('location')).not.toContain(host)
  })

  it('routes the current allocation instead of a formerly cached slug', async () => {
    const host = 'reallocated.example.com'
    await prime(host, 'acme')

    vi.mocked(createServerClient).mockClear()
    supabaseRef.respond = rows([{ slug: 'new-owner', domain_path: '/' }])
    const res = await proxy(request(`https://${host}/`, host))

    expect(createServerClient).toHaveBeenCalledOnce()
    expect(rewriteTarget(res)).toContain('/new-owner')
    expect(rewriteTarget(res)).not.toContain('/acme')
  })

  it('fails closed instead of serving a stale grant when authoritative revalidation throws', async () => {
    const host = 'lookup-failed.example.com'
    await prime(host, 'acme')

    failWith(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }))
    const res = await proxy(request(`https://${host}/`, host))

    expect(rewriteTarget(res)).toBeNull()
    expect(res.status).toBe(308)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('custom-domain lookup failed'),
      host,
      'ECONNRESET',
    )
  })

  it('fails closed on a PostgREST error payload too', async () => {
    const host = 'pgerror.example.com'
    await prime(host, 'acme')

    supabaseRef.respond = async () => ({ data: null, error: { code: '42501', message: 'permission denied' } })

    const res = await proxy(request(`https://${host}/`, host))
    expect(rewriteTarget(res)).toBeNull()
    expect(res.status).toBe(308)
    expect(warn).toHaveBeenCalledWith(expect.any(String), host, '42501')
  })

  it('serves nothing routable, but does not throw, when the first ever lookup fails', async () => {
    const host = 'cold.example.com'
    failWith(new Error('boom'))

    // No stale map exists, so this host has nothing to route: it falls through to
    // the canonical-host redirect rather than erroring.
    const res = await proxy(request(`https://${host}/`, host))
    expect(res.status).toBe(308)
    expect(warn).toHaveBeenCalled()
  })

  it('retries authoritatively on the very next request after a failure', async () => {
    const host = 'recover.example.com'
    failWith(new Error('boom'))
    expect((await proxy(request(`https://${host}/`, host))).status).toBe(308)

    vi.mocked(createServerClient).mockClear()
    supabaseRef.respond = rows([{ slug: 'acme', domain_path: '/' }])
    const res = await proxy(request(`https://${host}/`, host))

    expect(createServerClient).toHaveBeenCalledOnce()
    expect(rewriteTarget(res)).toContain('/acme')
  })

  it('requires both published and currently-serving projection rows', async () => {
    await prime('filters.example.com', 'acme')
    expect(supabaseRef.eqs).toEqual(expect.arrayContaining([
      ['is_published', true],
      ['serving', true],
    ]))
  })
})
