import { beforeEach, describe, expect, it, vi } from 'vitest'
import dns from 'node:dns/promises'
import { getResolvedImportUrlError } from '../importer'

vi.mock('node:dns/promises', () => ({
  default: { lookup: vi.fn() },
}))

describe('importer URL safety', () => {
  beforeEach(() => {
    vi.mocked(dns.lookup).mockReset()
  })

  it('blocks public-looking hostnames that resolve to private addresses', async () => {
    vi.mocked(dns.lookup).mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as any)

    await expect(getResolvedImportUrlError('https://public-looking.example.com/services')).resolves.toMatch(/private|local/i)
  })

  it('allows public hostnames that resolve to public addresses', async () => {
    vi.mocked(dns.lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as any)

    await expect(getResolvedImportUrlError('https://safe-public.example.com/services')).resolves.toBeNull()
  })

  it('blocks a hostname resolving to an IPv4-MAPPED IPv6 that decodes to a private target (SSRF)', async () => {
    // link-local metadata IP 169.254.169.254 hidden inside a mapped v6 - dotted,
    // hex, and the deprecated ::a.b.c.d form all decode to the same blocked v4.
    for (const address of ['::ffff:169.254.169.254', '::ffff:a9fe:a9fe', '::169.254.169.254']) {
      vi.mocked(dns.lookup).mockResolvedValue([{ address, family: 6 }] as any)
      await expect(getResolvedImportUrlError('https://mapped.example.com/x')).resolves.toMatch(/private|local/i)
    }
  })

  it('still allows a mapped IPv6 that decodes to a PUBLIC v4', async () => {
    vi.mocked(dns.lookup).mockResolvedValue([{ address: '::ffff:93.184.216.34', family: 6 }] as any)
    await expect(getResolvedImportUrlError('https://mapped-public.example.com/x')).resolves.toBeNull()
  })
})
