import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('dns', () => ({ default: { resolveTxt: vi.fn() } }))

import dns from 'dns'
import { POST } from './route'

const post = (body: unknown) =>
  new Request('https://nexez.test/api/verify-custom-domain', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as any

// resolveTxt is callback-style; promisify(dns.resolveTxt) wraps the mock.
const setTxt = (records: string[][] | null, err?: Error) =>
  vi.mocked(dns.resolveTxt).mockImplementation(((_host: string, cb: any) =>
    err ? cb(err) : cb(null, records)) as any)

describe('POST /api/verify-custom-domain', () => {
  beforeEach(() => vi.clearAllMocks())

  it('400 when customDomain or token is missing', async () => {
    expect((await POST(post({}))).status).toBe(400)
    expect((await POST(post({ customDomain: 'agents.acme.com' }))).status).toBe(400)
  })

  it('verified:true when the TXT record contains the token', async () => {
    setTxt([['nexez-verify-abc123']])
    const body = await (await POST(post({ customDomain: 'agents.acme.com', token: 'nexez-verify-abc123' }))).json()
    expect(body).toMatchObject({ verified: true, domain: 'agents.acme.com' })
  })

  it('verified:false (200) when the TXT record does not match', async () => {
    setTxt([['some-other-value']])
    const res = await POST(post({ customDomain: 'agents.acme.com', token: 'nexez-verify-abc123' }))
    expect(res.status).toBe(200)
    expect((await res.json()).verified).toBe(false)
  })

  it('verified:false (200) with a graceful error when DNS lookup fails', async () => {
    setTxt(null, Object.assign(new Error('not found'), { code: 'ENOTFOUND' }))
    const res = await POST(post({ customDomain: 'agents.acme.com', token: 'nexez-verify-abc123' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.verified).toBe(false)
    expect(body.error).toBeTruthy()
  })

  it('strips protocol and rejects too-short domains', async () => {
    setTxt([['nexez-verify-abc123']])
    const body = await (await POST(post({ customDomain: 'https://agents.acme.com', token: 'nexez-verify-abc123' }))).json()
    expect(body.domain).toBe('agents.acme.com')
    expect((await POST(post({ customDomain: 'ab', token: 'x' }))).status).toBe(400)
  })
})
