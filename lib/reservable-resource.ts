import type { OfferInputField } from './offer-configuration'

export const RESERVABLE_RESOURCE_TERMS_VERSION = 1 as const
export const MAX_RESOURCE_REQUIREMENTS = 3
export const MAX_RESOURCE_QUANTITY = 10_000
export const MIN_RESOURCE_HOLD_TTL_SECONDS = 1_800
export const MAX_RESOURCE_HOLD_TTL_SECONDS = 3_600

export type FixedResourceQuantity = {
  source: 'fixed'
  value: number
}

export type InputResourceQuantity = {
  source: 'input'
  inputKey: string
}

export type ResourceQuantity = FixedResourceQuantity | InputResourceQuantity

export type OfferResourceRequirement = {
  poolId: string
  /** Required for reusable pools and forbidden for consumable pools at resolution time. */
  windowId?: string
  quantity: ResourceQuantity
}

/** Public merchant-authored references to authoritative server-side pools. */
export type ReservableResourceTerms = {
  schemaVersion: typeof RESERVABLE_RESOURCE_TERMS_VERSION
  requirements: OfferResourceRequirement[]
}

export type ReservableResourceValidation<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; error: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const KEY_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/

function recordValue(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function exactKeys(record: Record<string, unknown>, allowed: readonly string[]) {
  const set = new Set(allowed)
  return Object.keys(record).every((key) => set.has(key))
}

function quantity(value: unknown, inputs: readonly OfferInputField[]): ReservableResourceValidation<ResourceQuantity> {
  const record = recordValue(value)
  if (!record || typeof record.source !== 'string') {
    return { ok: false, code: 'resource_quantity_shape', error: 'Every resource requirement needs one fixed or canonical-input quantity.' }
  }
  if (record.source === 'fixed') {
    if (!exactKeys(record, ['source', 'value'])) {
      return { ok: false, code: 'resource_quantity_shape', error: 'A fixed resource quantity may contain only source and value.' }
    }
    if (!Number.isInteger(record.value) || (record.value as number) < 1 || (record.value as number) > MAX_RESOURCE_QUANTITY) {
      return {
        ok: false,
        code: 'resource_quantity_value',
        error: `A fixed resource quantity must be a whole number between 1 and ${MAX_RESOURCE_QUANTITY}.`,
      }
    }
    return { ok: true, value: { source: 'fixed', value: record.value as number } }
  }
  if (record.source === 'input') {
    if (!exactKeys(record, ['source', 'inputKey']) || typeof record.inputKey !== 'string' || !KEY_RE.test(record.inputKey)) {
      return { ok: false, code: 'resource_quantity_input', error: 'A resource quantity inputKey must be a valid offer input key.' }
    }
    const input = inputs.find((field) => field.key === record.inputKey)
    if (!input || input.valueType !== 'quantity' || !input.required) {
      return {
        ok: false,
        code: 'resource_quantity_input',
        error: `Resource quantity input ${JSON.stringify(record.inputKey)} must reference an existing required quantity input.`,
      }
    }
    return { ok: true, value: { source: 'input', inputKey: record.inputKey } }
  }
  return { ok: false, code: 'resource_quantity_source', error: 'Resource quantity source must be fixed or input.' }
}

/** Validate and canonicalize bounded merchant-authored resource references. */
export function validateReservableResourceTerms(
  value: unknown,
  inputs: readonly OfferInputField[] = [],
): ReservableResourceValidation<ReservableResourceTerms> {
  const record = recordValue(value)
  if (!record || !exactKeys(record, ['schemaVersion', 'requirements'])) {
    return { ok: false, code: 'resource_terms_shape', error: 'Reservable resource terms must use only the bounded v1 fields.' }
  }
  if (record.schemaVersion !== RESERVABLE_RESOURCE_TERMS_VERSION) {
    return { ok: false, code: 'resource_terms_version', error: 'Unsupported reservable resource terms schema version.' }
  }
  if (!Array.isArray(record.requirements) || record.requirements.length < 1 || record.requirements.length > MAX_RESOURCE_REQUIREMENTS) {
    return {
      ok: false,
      code: 'resource_requirement_count',
      error: `An offer needs between 1 and ${MAX_RESOURCE_REQUIREMENTS} resource requirements.`,
    }
  }

  const requirements: OfferResourceRequirement[] = []
  const seenPools = new Set<string>()
  for (const raw of record.requirements) {
    const requirement = recordValue(raw)
    if (!requirement || !exactKeys(requirement, ['poolId', 'windowId', 'quantity'])) {
      return { ok: false, code: 'resource_requirement_shape', error: 'Every resource requirement may contain only poolId, windowId, and quantity.' }
    }
    if (typeof requirement.poolId !== 'string' || !UUID_RE.test(requirement.poolId)) {
      return { ok: false, code: 'resource_pool_id', error: 'Every resource requirement must reference a valid pool UUID.' }
    }
    const poolId = requirement.poolId.toLowerCase()
    if (seenPools.has(poolId)) {
      return { ok: false, code: 'resource_pool_duplicate', error: `Resource pool ${JSON.stringify(poolId)} may appear only once per offer.` }
    }
    seenPools.add(poolId)

    let windowId: string | undefined
    if (requirement.windowId != null) {
      if (typeof requirement.windowId !== 'string' || !UUID_RE.test(requirement.windowId)) {
        return { ok: false, code: 'resource_window_id', error: 'A resource windowId must be a valid UUID.' }
      }
      windowId = requirement.windowId.toLowerCase()
    }
    const resolvedQuantity = quantity(requirement.quantity, inputs)
    if (!resolvedQuantity.ok) return resolvedQuantity
    requirements.push({ poolId, ...(windowId ? { windowId } : {}), quantity: resolvedQuantity.value })
  }

  return {
    ok: true,
    value: { schemaVersion: RESERVABLE_RESOURCE_TERMS_VERSION, requirements },
  }
}

export function resolveResourceRequirementQuantities(
  terms: ReservableResourceTerms,
  configuration: Readonly<Record<string, unknown>>,
): ReservableResourceValidation<Array<OfferResourceRequirement & { resolvedQuantity: number }>> {
  const resolved = terms.requirements.map((requirement) => {
    const raw = requirement.quantity.source === 'fixed'
      ? requirement.quantity.value
      : configuration[requirement.quantity.inputKey]
    if (!Number.isInteger(raw) || (raw as number) < 1 || (raw as number) > MAX_RESOURCE_QUANTITY) {
      return null
    }
    return { ...requirement, resolvedQuantity: raw as number }
  })
  if (resolved.some((requirement) => requirement == null)) {
    return {
      ok: false,
      code: 'resource_quantity_unresolved',
      error: `Every resolved resource quantity must be a whole number between 1 and ${MAX_RESOURCE_QUANTITY}.`,
    }
  }
  return { ok: true, value: resolved as Array<OfferResourceRequirement & { resolvedQuantity: number }> }
}
