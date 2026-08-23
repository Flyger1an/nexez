import { afterEach, describe, expect, it, vi } from 'vitest'
import nextConfig from '../../next.config'

type HeaderRule = {
  source: string
  headers: Array<{ key: string; value: string }>
}

function asHeaderMap(rule: HeaderRule | undefined): Record<string, string> {
  return Object.fromEntries((rule?.headers ?? []).map(({ key, value }) => [key, value]))
}

describe('staged settlement browser CORS', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('allows only the configured app origin on the public status and checkout routes', async () => {
    const rules = await nextConfig.headers?.() as HeaderRule[]
    const status = asHeaderMap(rules.find((rule) => rule.source === '/api/staged-settlements/:token'))
    const checkout = asHeaderMap(rules.find((rule) => rule.source === '/api/staged-settlements/:token/checkout'))

    expect(status['Access-Control-Allow-Origin']).toBe('https://app.nexez.ai')
    expect(status['Access-Control-Allow-Methods']).toBe('GET, OPTIONS')
    expect(checkout['Access-Control-Allow-Origin']).toBe('https://app.nexez.ai')
    expect(checkout['Access-Control-Allow-Methods']).toBe('POST, OPTIONS')
    expect(checkout['Access-Control-Allow-Headers']).toBe('Content-Type, Idempotency-Key')
    expect(checkout['Access-Control-Allow-Credentials']).toBeUndefined()
    expect(checkout['Access-Control-Allow-Origin']).not.toBe('*')
  })

  it('normalizes a configured app URL to its origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://seller.example.test/dashboard')
    const rules = await nextConfig.headers?.() as HeaderRule[]
    const checkout = asHeaderMap(rules.find((rule) => rule.source === '/api/staged-settlements/:token/checkout'))

    expect(checkout['Access-Control-Allow-Origin']).toBe('https://seller.example.test')
  })

  it('fails closed to the production app origin for an invalid protocol', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'javascript:alert(1)')
    const rules = await nextConfig.headers?.() as HeaderRule[]
    const checkout = asHeaderMap(rules.find((rule) => rule.source === '/api/staged-settlements/:token/checkout'))

    expect(checkout['Access-Control-Allow-Origin']).toBe('https://app.nexez.ai')
  })
})
