export type ResourcePoolDraft = {
  resourceKey: string
  label: string
  unitLabel: string
  kind: 'consumable' | 'reusable'
  totalQuantity: number
  status: 'active' | 'paused' | 'retired'
}

export type ResourceWindowDraft = {
  windowKey: string
  label: string
  startsAt: string
  endsAt: string
  totalQuantity: number
  status: 'active' | 'paused' | 'retired'
}

export type ResourceDraftValidation<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

const KEY_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/
const SAFE_TEXT_RE = /^[^\u0000-\u001f\u007f<>]+$/
const STATUSES = new Set(['active', 'paused', 'retired'])

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function text(value: unknown, field: string, max: number): ResourceDraftValidation<string> {
  if (typeof value !== 'string' || !value.trim()) return { ok: false, error: `${field} is required.` }
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (normalized.length > max || !SAFE_TEXT_RE.test(normalized)) {
    return { ok: false, error: `${field} must be plain text with at most ${max} characters.` }
  }
  return { ok: true, value: normalized }
}

function key(value: unknown, field: string): ResourceDraftValidation<string> {
  if (typeof value !== 'string' || !KEY_RE.test(value)) {
    return { ok: false, error: `${field} must use lowercase letters, numbers, underscores, or hyphens.` }
  }
  return { ok: true, value }
}

function quantity(value: unknown): ResourceDraftValidation<number> {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 1_000_000) {
    return { ok: false, error: 'totalQuantity must be a whole number between 1 and 1000000.' }
  }
  return { ok: true, value: value as number }
}

function status(value: unknown): ResourceDraftValidation<ResourcePoolDraft['status']> {
  const normalized = value ?? 'active'
  if (typeof normalized !== 'string' || !STATUSES.has(normalized)) {
    return { ok: false, error: 'status must be active, paused, or retired.' }
  }
  return { ok: true, value: normalized as ResourcePoolDraft['status'] }
}

export function validateResourcePoolDraft(value: unknown): ResourceDraftValidation<ResourcePoolDraft> {
  const raw = record(value)
  if (!raw) return { ok: false, error: 'Resource pool must be an object.' }
  const resourceKey = key(raw.resourceKey, 'resourceKey')
  if (!resourceKey.ok) return resourceKey
  const label = text(raw.label, 'label', 120)
  if (!label.ok) return label
  const unitLabel = text(raw.unitLabel, 'unitLabel', 60)
  if (!unitLabel.ok) return unitLabel
  if (raw.kind !== 'consumable' && raw.kind !== 'reusable') {
    return { ok: false, error: 'kind must be consumable or reusable.' }
  }
  const totalQuantity = quantity(raw.totalQuantity)
  if (!totalQuantity.ok) return totalQuantity
  const poolStatus = status(raw.status)
  if (!poolStatus.ok) return poolStatus
  return {
    ok: true,
    value: {
      resourceKey: resourceKey.value,
      label: label.value,
      unitLabel: unitLabel.value,
      kind: raw.kind,
      totalQuantity: totalQuantity.value,
      status: poolStatus.value,
    },
  }
}

export function validateResourceWindowDraft(value: unknown): ResourceDraftValidation<ResourceWindowDraft> {
  const raw = record(value)
  if (!raw) return { ok: false, error: 'Resource window must be an object.' }
  const windowKey = key(raw.windowKey, 'windowKey')
  if (!windowKey.ok) return windowKey
  const label = text(raw.label, 'label', 120)
  if (!label.ok) return label
  if (typeof raw.startsAt !== 'string' || typeof raw.endsAt !== 'string') {
    return { ok: false, error: 'startsAt and endsAt must be ISO date-time strings.' }
  }
  const starts = Date.parse(raw.startsAt)
  const ends = Date.parse(raw.endsAt)
  if (!Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts) {
    return { ok: false, error: 'Resource window must have valid date-times with endsAt after startsAt.' }
  }
  const totalQuantity = quantity(raw.totalQuantity)
  if (!totalQuantity.ok) return totalQuantity
  const windowStatus = status(raw.status)
  if (!windowStatus.ok) return windowStatus
  return {
    ok: true,
    value: {
      windowKey: windowKey.value,
      label: label.value,
      startsAt: new Date(starts).toISOString(),
      endsAt: new Date(ends).toISOString(),
      totalQuantity: totalQuantity.value,
      status: windowStatus.value,
    },
  }
}
