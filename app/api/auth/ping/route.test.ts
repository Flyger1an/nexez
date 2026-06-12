import { describe, it, expect } from 'vitest'
import { GET, OPTIONS } from './route'

const req = (opts: { cookie?: string; origin?: string }) =>
  new Request('https://nexez.app/api/auth/ping', {
    headers: {
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
      ...(opts.origin ? { origin: opts.origin } : {}),
    },
  })

describe('GET /api/auth/ping (cross-domain auth hint)', () => {
  it('reports authed when the nx_authed hint cookie is set', async () => {
    const res = await GET(req({ cookie: 'foo=1; nx_authed=1; bar=2', origin: 'https://nexez.ai' }))
    expect(await res.json()).toEqual({ authed: true })
  })

  it('reports not authed without the hint', async () => {
    expect(await (await GET(req({ origin: 'https://nexez.ai' }))).json()).toEqual({ authed: false })
    expect(await (await GET(req({ cookie: 'other=1', origin: 'https://nexez.ai' }))).json()).toEqual({ authed: false })
  })

  it('grants credentialed CORS only to the marketing origin', async () => {
    const ok = await GET(req({ cookie: 'nx_authed=1', origin: 'https://nexez.ai' }))
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://nexez.ai')
    expect(ok.headers.get('access-control-allow-credentials')).toBe('true')

    const evil = await GET(req({ cookie: 'nx_authed=1', origin: 'https://evil.example' }))
    expect(evil.headers.get('access-control-allow-origin')).toBeNull()
    // Must never echo a wildcard on a credentialed response.
    expect(ok.headers.get('access-control-allow-origin')).not.toBe('*')
  })

  it('OPTIONS preflight returns 204 with CORS for the marketing origin', async () => {
    const res = await OPTIONS(req({ origin: 'https://nexez.ai' }))
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://nexez.ai')
    expect(res.headers.get('access-control-allow-methods')).toContain('GET')
  })
})
