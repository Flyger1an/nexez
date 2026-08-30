import { describe, expect, it } from 'vitest'
import {
  MOBILE_CONNECTOR_CATALOG,
  MOBILE_CONNECTOR_PROVIDERS,
} from '../apps/seller-mobile/src/lib/mobile-connector-catalog'
import { CONNECTOR_MANIFEST, CONNECTOR_PROVIDERS } from './integration-capabilities'

describe('seller mobile connector parity', () => {
  it('covers every platform connector provider', () => {
    expect([...MOBILE_CONNECTOR_PROVIDERS].sort()).toEqual([...CONNECTOR_PROVIDERS].sort())
    expect(Object.keys(MOBILE_CONNECTOR_CATALOG).sort()).toEqual([...CONNECTOR_PROVIDERS].sort())
  })

  it.each(CONNECTOR_PROVIDERS)('matches the %s authentication and capability contract', (provider) => {
    const platform = CONNECTOR_MANIFEST[provider]
    const mobile = MOBILE_CONNECTOR_CATALOG[provider]

    expect(mobile.provider).toBe(platform.provider)
    expect(mobile.auth).toBe(platform.auth)
    expect([...mobile.capabilities].sort()).toEqual([...platform.capabilities].sort())
    expect(mobile.premium).toBe(platform.plan === 'integrations')
    expect(mobile.description.trim()).not.toBe('')
    expect(mobile.webPath.startsWith('/')).toBe(true)
  })
})
