import { beforeEach, describe, expect, it, vi } from 'vitest'
import dns from 'node:dns/promises'
import { getImportUrlError, getResolvedImportUrlError, isPathAllowedByRobots } from '../importer'

vi.mock('node:dns/promises', () => ({
  default: { lookup: vi.fn() },
}))

describe('importer URL safety', () => {
  beforeEach(() => {
    vi.mocked(dns.lookup).mockReset()
  })

  it('rejects embedded credentials before any network request', () => {
    expect(getImportUrlError('https://admin:secret@example.com/')).toMatch(/credentials/i)
  })

  it('fails closed when strict DNS validation cannot complete', async () => {
    vi.mocked(dns.lookup).mockRejectedValue(new Error('resolver unavailable'))
    await expect(
      getResolvedImportUrlError('https://strict-scan.example.com/', { useCache: false, failClosed: true }),
    ).resolves.toMatch(/could not be resolved/i)
  })

  // A lookup that TIMED OUT means we were busy; a lookup that FAILED means the
  // domain is probably gone. Under concurrent scans the first is common, and
  // reporting it as the second tells a live merchant their site is broken.
  it('distinguishes a timed-out lookup from a genuinely failed one', async () => {
    vi.mocked(dns.lookup).mockImplementation(() => new Promise(() => {}) as any) // never settles
    await expect(
      getResolvedImportUrlError('https://slow.example.com/', { useCache: false, failClosed: true }),
    ).resolves.toMatch(/in time|try again/i)
  }, 10_000)

  it('does not cache a timed-out lookup as a verdict about the host', async () => {
    // First call times out. Second call resolves fine. With the timeout cached
    // the second would wrongly inherit the failure for the whole TTL.
    vi.mocked(dns.lookup).mockImplementationOnce(() => new Promise(() => {}) as any)
    await expect(getResolvedImportUrlError('https://flaky.example.com/', { failClosed: true })).resolves.toMatch(/in time/i)

    vi.mocked(dns.lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as any)
    await expect(getResolvedImportUrlError('https://flaky.example.com/', { failClosed: true })).resolves.toBeNull()
  }, 10_000)

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

  it('applies the most specific robots rule without lowercasing the requested path', () => {
    const robots = [
      'User-agent: *',
      'Disallow: /private',
      'Allow: /private/public-offer',
      'Disallow: /CaseSensitive',
    ].join('\n')

    expect(isPathAllowedByRobots(robots, '/private/internal')).toBe(false)
    expect(isPathAllowedByRobots(robots, '/private/public-offer/today')).toBe(true)
    expect(isPathAllowedByRobots(robots, '/casesensitive')).toBe(true)
    expect(isPathAllowedByRobots(robots, '/CaseSensitive')).toBe(false)
  })
})
