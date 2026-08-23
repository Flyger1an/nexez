import { describe, expect, it } from 'vitest'
import { resolveShopifyIntegrationStatus, shopifyConnectionCanSync } from './types'

describe('authoritative Shopify editor connection state', () => {
  it('never upgrades a browser marker into an installed or manual live connection', () => {
    expect(resolveShopifyIntegrationStatus(null, {
      present: true,
      lastImport: '2026-08-22T00:00:00Z',
    })).toEqual({
      kind: 'other',
      lastImport: '2026-08-22T00:00:00Z',
    })
    expect(shopifyConnectionCanSync('other', true)).toBe(false)
  })

  it('keeps the server kind authoritative while using browser time only as history fallback', () => {
    expect(resolveShopifyIntegrationStatus({ kind: 'oauth', lastSyncedAt: null }, {
      present: true,
      lastImport: '2026-08-21T00:00:00Z',
    })).toEqual({ kind: 'oauth', lastImport: '2026-08-21T00:00:00Z' })
    expect(resolveShopifyIntegrationStatus({ kind: 'token', lastSyncedAt: '2026-08-22T00:00:00Z' }, {
      present: true,
      lastImport: '2026-08-21T00:00:00Z',
    })).toEqual({ kind: 'token', lastImport: '2026-08-22T00:00:00Z' })
  })

  it('allows installed OAuth on every plan and manual Admin sync only with Pro', () => {
    expect(shopifyConnectionCanSync('oauth', false)).toBe(true)
    expect(shopifyConnectionCanSync('token', false)).toBe(false)
    expect(shopifyConnectionCanSync('token', true)).toBe(true)
    expect(shopifyConnectionCanSync(undefined, true)).toBe(false)
  })
})
