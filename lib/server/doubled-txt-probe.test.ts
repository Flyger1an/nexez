import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('dns', () => ({ default: { resolveTxt: vi.fn() } }))

import dns from 'dns'
import { hasLegacyCustomDomainTxt } from './doubled-txt-probe'

const setTxt = (records: string[][] | null, err?: Error) =>
  vi.mocked(dns.resolveTxt).mockImplementation(((_host: string, cb: any) =>
    err ? cb(err) : cb(null, records)) as any)

describe('hasLegacyCustomDomainTxt', () => {
  beforeEach(() => vi.clearAllMocks())

  it('detects only the custom-domain token prefix', async () => {
    setTxt([['nexez-verify-legacy-token']])
    await expect(hasLegacyCustomDomainTxt('agents.acme.com')).resolves.toBe(true)
    expect(dns.resolveTxt).toHaveBeenCalledWith('_nexez-verify.agents.acme.com', expect.any(Function))
  })

  it('does not treat website verification or unrelated TXT data as the blocker', async () => {
    setTxt([['nexez-site-verify-abcdef0123456789'], ['google-site-verification=value']])
    await expect(hasLegacyCustomDomainTxt('agents.acme.com')).resolves.toBe(false)
  })

  it('returns false when the child TXT record does not resolve', async () => {
    setTxt(null, Object.assign(new Error('not found'), { code: 'ENOTFOUND' }))
    await expect(hasLegacyCustomDomainTxt('agents.acme.com')).resolves.toBe(false)
  })
})
