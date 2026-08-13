import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('getDomainStatus provider contract', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VERCEL_API_TOKEN', 'test-token')
    vi.stubEnv('VERCEL_PROJECT_ID', 'prj_test')
    vi.stubEnv('VERCEL_TEAM_ID', 'team_test')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('classifies a healthy subdomain from apexName and configuration data', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('/config')
        ? jsonResponse({
            configuredBy: 'CNAME',
            misconfigured: false,
            recommendedCNAME: [{ rank: 1, value: 'project.vercel-dns-017.com' }],
            recommendedIPv4: [],
          })
        : jsonResponse({
            name: 'agents.acme.com',
            apexName: 'acme.com',
            verified: true,
            verification: [],
          }),
    ))

    const { getDomainStatus, isCnameProviderProof } = await import('../vercel-domains')
    const status = await getDomainStatus('agents.acme.com')

    expect(status).toMatchObject({
      attached: true,
      verified: true,
      configChecked: true,
      misconfigured: false,
      configuredBy: 'CNAME',
      apexName: 'acme.com',
      verificationMethod: 'cname',
      recommendedCNAME: ['project.vercel-dns-017.com'],
    })
    expect(isCnameProviderProof(status)).toBe(true)
  })

  it('keeps access-verification challenges separate from routing recommendations', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('/config')
        ? jsonResponse({
            configuredBy: 'A',
            misconfigured: false,
            recommendedCNAME: [],
            recommendedIPv4: [{ rank: 1, value: ['76.76.21.21'] }],
          })
        : jsonResponse({
            name: 'acme.com',
            apexName: 'acme.com',
            verified: false,
            verification: [{ type: 'TXT', domain: '_vercel.acme.com', value: 'vc-domain-verify=value' }],
          }),
    ))

    const { getDomainStatus } = await import('../vercel-domains')
    const status = await getDomainStatus('acme.com')

    expect(status.verificationMethod).toBe('txt')
    expect(status.requiredRecords).toEqual([
      { type: 'TXT', name: '_vercel.acme.com', value: 'vc-domain-verify=value' },
    ])
    expect(status.recommendedIPv4).toEqual(['76.76.21.21'])
  })

  it('never treats a failed configuration request as a checked, healthy domain', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('/config')
        ? jsonResponse({ error: 'unavailable' }, 503)
        : jsonResponse({ name: 'agents.acme.com', apexName: 'acme.com', verified: true }),
    ))

    const { getDomainStatus, isCnameProviderProof } = await import('../vercel-domains')
    const status = await getDomainStatus('agents.acme.com')

    expect(status).toMatchObject({
      attached: true,
      verified: true,
      configChecked: false,
      misconfigured: null,
      verificationMethod: 'cname',
    })
    expect(status.error).toMatch(/configuration failed/i)
    expect(isCnameProviderProof(status)).toBe(false)
  })
})
