import { describe, expect, it } from 'vitest'
import {
  MARKETPLACE_DISCOVERY_MERCHANT_THRESHOLD,
  MARKETPLACE_DISCOVERY_PATHS,
  parseMarketplaceDiscoveryEnabled,
} from '../marketplace-discovery'

describe('marketplace discovery launch control', () => {
  it('stays hidden unless the launch switch is explicitly true', () => {
    expect(parseMarketplaceDiscoveryEnabled(undefined)).toBe(false)
    expect(parseMarketplaceDiscoveryEnabled('')).toBe(false)
    expect(parseMarketplaceDiscoveryEnabled('false')).toBe(false)
    expect(parseMarketplaceDiscoveryEnabled('1')).toBe(false)
    expect(parseMarketplaceDiscoveryEnabled(' true ')).toBe(true)
    expect(parseMarketplaceDiscoveryEnabled('TRUE')).toBe(true)
  })

  it('records the approved merchant threshold and human routes', () => {
    expect(MARKETPLACE_DISCOVERY_MERCHANT_THRESHOLD).toBe(50)
    expect(MARKETPLACE_DISCOVERY_PATHS).toEqual(['/discovery', '/leaderboard'])
  })
})
