import { describe, expect, it } from 'vitest'
import {
  resolveResourceAllocations,
  resourceAllocationRpcPayload,
  resourceApprovalPayload,
  type ResourcePoolAuthority,
  type ResourceWindowAuthority,
} from '../reservable-resource-runtime'

const OWNER = 'owner-1'
const PAGE = 'page-1'
const CONSUMABLE = '11111111-1111-4111-8111-111111111111'
const REUSABLE = '22222222-2222-4222-8222-222222222222'
const WINDOW = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const pools: ResourcePoolAuthority[] = [
  { id: CONSUMABLE, ownerId: OWNER, pageId: PAGE, key: 'kits', label: 'Dinner kits', unitLabel: 'kits', kind: 'consumable', totalQuantity: 10, status: 'active', version: 3 },
  { id: REUSABLE, ownerId: OWNER, pageId: PAGE, key: 'guests', label: 'Guest capacity', unitLabel: 'guests', kind: 'reusable', totalQuantity: 100, status: 'active', version: 5 },
]
const windows: ResourceWindowAuthority[] = [{
  id: WINDOW,
  poolId: REUSABLE,
  key: 'evening',
  label: 'Evening service',
  startsAt: '2030-09-03T18:00:00Z',
  endsAt: '2030-09-03T23:00:00Z',
  totalQuantity: 60,
  status: 'active',
  version: 2,
}]
const terms = {
  schemaVersion: 1 as const,
  requirements: [
    { poolId: CONSUMABLE, quantity: { source: 'fixed' as const, value: 1 } },
    { poolId: REUSABLE, windowId: WINDOW, quantity: { source: 'input' as const, inputKey: 'guest_count' } },
  ],
}

describe('reservable resource runtime resolver', () => {
  it('resolves merchant authority and canonical buyer quantity without claiming a hold', () => {
    const result = resolveResourceAllocations({
      terms,
      configuration: { guest_count: 40 },
      pools,
      windows,
      ownerId: OWNER,
      pageId: PAGE,
      nowMs: Date.parse('2030-09-01T00:00:00Z'),
    })
    expect(result).toMatchObject({
      ok: true,
      value: [
        { poolId: CONSUMABLE, poolVersion: 3, quantity: 1, capacity: 10 },
        { poolId: REUSABLE, poolVersion: 5, windowId: WINDOW, windowVersion: 2, quantity: 40, capacity: 60 },
      ],
    })
    if (!result.ok) throw new Error(result.error)
    expect(resourceAllocationRpcPayload(result.value)).toEqual([
      { poolId: CONSUMABLE, poolVersion: 3, quantity: 1 },
      { poolId: REUSABLE, poolVersion: 5, windowId: WINDOW, windowVersion: 2, quantity: 40 },
    ])
  })

  it('rejects wrong ownership, external window identity, and expired windows', () => {
    expect(resolveResourceAllocations({ terms, configuration: { guest_count: 4 }, pools: [{ ...pools[0], ownerId: 'other' }, pools[1]], windows, ownerId: OWNER, pageId: PAGE })).toMatchObject({ ok: false, code: 'resource_pool_unavailable' })
    expect(resolveResourceAllocations({ terms, configuration: { guest_count: 4 }, pools, windows: [{ ...windows[0], poolId: CONSUMABLE }], ownerId: OWNER, pageId: PAGE })).toMatchObject({ ok: false, code: 'resource_window_unavailable' })
    expect(resolveResourceAllocations({ terms, configuration: { guest_count: 4 }, pools, windows, ownerId: OWNER, pageId: PAGE, nowMs: Date.parse('2031-01-01T00:00:00Z') })).toMatchObject({ ok: false, code: 'resource_window_unavailable' })
  })

  it('builds a buyer approval payload that binds identity, expiry, versions, and quantities', () => {
    const resolved = resolveResourceAllocations({ terms, configuration: { guest_count: 40 }, pools, windows, ownerId: OWNER, pageId: PAGE, nowMs: Date.parse('2030-09-01T00:00:00Z') })
    if (!resolved.ok) throw new Error(resolved.error)
    expect(resourceApprovalPayload({
      holdId: 'hold-1',
      expiresAt: '2030-09-01T00:30:00.000Z',
      allocationFingerprint: 'f'.repeat(64),
      allocations: resolved.value,
    })).toEqual({
      resources: {
        status: 'held',
        holdId: 'hold-1',
        expiresAt: '2030-09-01T00:30:00.000Z',
        allocationFingerprint: 'f'.repeat(64),
        allocations: [
          { poolId: CONSUMABLE, poolVersion: 3, windowId: null, windowVersion: null, quantity: 1 },
          { poolId: REUSABLE, poolVersion: 5, windowId: WINDOW, windowVersion: 2, quantity: 40 },
        ],
      },
    })
  })
})
