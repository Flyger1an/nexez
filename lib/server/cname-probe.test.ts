import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('dns', () => ({ default: { resolveCname: vi.fn() } }))

import dns from 'dns'
import { hasExpectedCname } from './cname-probe'

const setCname = (records: string[] | null, err?: Error) =>
  vi.mocked(dns.resolveCname).mockImplementation(((_host: string, cb: any) =>
    err ? cb(err) : cb(null, records)) as any)

describe('hasExpectedCname', () => {
  beforeEach(() => vi.clearAllMocks())

  it('accepts the expected target case-insensitively and with a trailing dot', async () => {
    setCname(['CNAME.NEXEZ.APP.'])
    await expect(hasExpectedCname('agents.acme.com', 'cname.nexez.app')).resolves.toBe(true)
    expect(dns.resolveCname).toHaveBeenCalledWith('agents.acme.com', expect.any(Function))
  })

  it('rejects a different CNAME target', async () => {
    setCname(['other.example.com'])
    await expect(hasExpectedCname('agents.acme.com', 'cname.nexez.app')).resolves.toBe(false)
  })

  it('returns false when no CNAME resolves', async () => {
    setCname(null, Object.assign(new Error('not found'), { code: 'ENODATA' }))
    await expect(hasExpectedCname('agents.acme.com', 'cname.nexez.app')).resolves.toBe(false)
  })
})
