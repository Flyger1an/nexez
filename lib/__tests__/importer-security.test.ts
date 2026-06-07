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
})
