import { describe, expect, it, vi } from 'vitest'
import { removeManagedCustomDomain } from '../custom-domain-cleanup'

describe('removeManagedCustomDomain', () => {
  it('uses the provider-cleanup action before callers clear a saved hostname', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      removed: true,
      providerDetached: false,
      sharedDomainRetained: true,
      staleClaimRemoved: false,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    await expect(removeManagedCustomDomain({
      domain: 'agents.acme.test',
      pageId: 'page-1',
      fetchImpl,
    })).resolves.toEqual({
      ok: true,
      providerDetached: false,
      sharedDomainRetained: true,
      staleClaimRemoved: false,
    })

    expect(fetchImpl).toHaveBeenCalledWith('/api/custom-domain', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ action: 'remove', domain: 'agents.acme.test', pageId: 'page-1' }),
    }))
  })

  it('fails closed when provider cleanup cannot be confirmed', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: 'provider unavailable' }), { status: 502 }))

    await expect(removeManagedCustomDomain({
      domain: 'agents.acme.test',
      pageId: 'page-1',
      fetchImpl,
    })).resolves.toEqual({ ok: false, error: 'provider unavailable' })
  })
})
