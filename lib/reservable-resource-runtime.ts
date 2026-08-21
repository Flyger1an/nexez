import {
  resolveResourceRequirementQuantities,
  type ReservableResourceTerms,
  type ReservableResourceValidation,
} from './reservable-resource'

export type ResourcePoolAuthority = {
  id: string
  ownerId: string
  pageId: string
  key: string
  label: string
  unitLabel: string
  kind: 'consumable' | 'reusable'
  totalQuantity: number
  status: 'active' | 'paused' | 'retired'
  version: number
}

export type ResourceWindowAuthority = {
  id: string
  poolId: string
  key: string
  label: string
  startsAt: string
  endsAt: string
  totalQuantity: number
  status: 'active' | 'paused' | 'retired'
  version: number
}

export type ResolvedResourceAllocation = {
  poolId: string
  poolKey: string
  poolLabel: string
  poolVersion: number
  kind: 'consumable' | 'reusable'
  unit: string
  quantity: number
  capacity: number
  windowId?: string
  windowKey?: string
  windowLabel?: string
  windowVersion?: number
  startsAt?: string
  endsAt?: string
}

function finiteTimestamp(value: string) {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

/**
 * Resolve only canonical buyer quantity against explicit merchant authority.
 * This does not claim availability or acquire anything; the database RPC is
 * the sole authority for remaining quantity and the all-or-none hold.
 */
export function resolveResourceAllocations(input: {
  terms: ReservableResourceTerms
  configuration: Readonly<Record<string, unknown>>
  pools: readonly ResourcePoolAuthority[]
  windows: readonly ResourceWindowAuthority[]
  ownerId: string
  pageId: string
  nowMs?: number
}): ReservableResourceValidation<ResolvedResourceAllocation[]> {
  const quantities = resolveResourceRequirementQuantities(input.terms, input.configuration)
  if (!quantities.ok) return quantities
  const pools = new Map(input.pools.map((pool) => [pool.id.toLowerCase(), pool] as const))
  const windows = new Map(input.windows.map((window) => [window.id.toLowerCase(), window] as const))
  const nowMs = input.nowMs ?? Date.now()
  const allocations: ResolvedResourceAllocation[] = []

  for (const requirement of quantities.value) {
    const pool = pools.get(requirement.poolId)
    if (!pool || pool.ownerId !== input.ownerId || pool.pageId !== input.pageId || pool.status !== 'active') {
      return { ok: false, code: 'resource_pool_unavailable', error: 'A required merchant resource pool is missing or inactive.' }
    }
    if (!Number.isSafeInteger(pool.version) || pool.version < 1 || !Number.isInteger(pool.totalQuantity) || pool.totalQuantity < 1) {
      return { ok: false, code: 'resource_pool_invalid', error: 'A required merchant resource pool has invalid authority data.' }
    }

    if (pool.kind === 'consumable') {
      if (requirement.windowId) {
        return { ok: false, code: 'resource_window_forbidden', error: 'Consumable resource pools cannot reference an availability window.' }
      }
      allocations.push({
        poolId: pool.id,
        poolKey: pool.key,
        poolLabel: pool.label,
        poolVersion: pool.version,
        kind: pool.kind,
        unit: pool.unitLabel,
        quantity: requirement.resolvedQuantity,
        capacity: pool.totalQuantity,
      })
      continue
    }

    if (!requirement.windowId) {
      return { ok: false, code: 'resource_window_required', error: 'Reusable resource pools require one explicit merchant availability window.' }
    }
    const window = windows.get(requirement.windowId)
    const startsAt = window ? finiteTimestamp(window.startsAt) : null
    const endsAt = window ? finiteTimestamp(window.endsAt) : null
    if (
      !window
      || window.poolId !== pool.id
      || window.status !== 'active'
      || startsAt == null
      || endsAt == null
      || endsAt <= startsAt
      || endsAt <= nowMs
      || !Number.isSafeInteger(window.version)
      || window.version < 1
      || !Number.isInteger(window.totalQuantity)
      || window.totalQuantity < 1
      || window.totalQuantity > pool.totalQuantity
    ) {
      return { ok: false, code: 'resource_window_unavailable', error: 'A required merchant resource window is missing, inactive, expired, or invalid.' }
    }
    allocations.push({
      poolId: pool.id,
      poolKey: pool.key,
      poolLabel: pool.label,
      poolVersion: pool.version,
      kind: pool.kind,
      unit: pool.unitLabel,
      quantity: requirement.resolvedQuantity,
      capacity: window.totalQuantity,
      windowId: window.id,
      windowKey: window.key,
      windowLabel: window.label,
      windowVersion: window.version,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
    })
  }

  return { ok: true, value: allocations.sort((left, right) => left.poolId.localeCompare(right.poolId)) }
}

export function resourceAllocationRpcPayload(allocations: readonly ResolvedResourceAllocation[]) {
  return allocations.map((allocation) => ({
    poolId: allocation.poolId,
    poolVersion: allocation.poolVersion,
    quantity: allocation.quantity,
    ...(allocation.windowId
      ? { windowId: allocation.windowId, windowVersion: allocation.windowVersion }
      : {}),
  }))
}

export type ResourceApprovalPayload = {
  resources: {
    status: 'held'
    holdId: string
    expiresAt: string
    allocationFingerprint: string
    allocations: Array<{
      poolId: string
      poolVersion: number
      windowId: string | null
      windowVersion: number | null
      quantity: number
    }>
  }
}

export function resourceApprovalPayload(input: {
  holdId: string
  expiresAt: string
  allocationFingerprint: string
  allocations: readonly ResolvedResourceAllocation[]
}): ResourceApprovalPayload {
  return {
    resources: {
      status: 'held',
      holdId: input.holdId,
      expiresAt: input.expiresAt,
      allocationFingerprint: input.allocationFingerprint,
      allocations: input.allocations.map((allocation) => ({
        poolId: allocation.poolId,
        poolVersion: allocation.poolVersion,
        windowId: allocation.windowId ?? null,
        windowVersion: allocation.windowVersion ?? null,
        quantity: allocation.quantity,
      })),
    },
  }
}
