import type { OfferItem } from './agent-page'
import { getOfferCustomerInputs } from './configured-offer'
import type { OfferInputField, OfferInputValueType } from './offer-configuration'

export type OfferTransactionConfigurationValue = string | number | boolean | string[]
export type OfferTransactionConfiguration = Record<string, OfferTransactionConfigurationValue>

export type OfferTransactionConfigurationErrorCode =
  | 'configuration_not_object'
  | 'unknown_field'
  | 'missing_required'
  | 'invalid_type'
  | 'invalid_value'

export type OfferTransactionConfigurationError = {
  key: string | null
  code: OfferTransactionConfigurationErrorCode
  message: string
}

export type OfferTransactionConfigurationValidation =
  | {
      ok: true
      value: OfferTransactionConfiguration
      schema: OfferInputField[]
    }
  | {
      ok: false
      errors: OfferTransactionConfigurationError[]
      schema: OfferInputField[]
    }

const MAX_CONFIGURATION_FIELDS = 25
const MAX_TEXT = 2_000
const MAX_LOCATION = 500
const MAX_ASSET_REFERENCE = 2_000
const MAX_SELECT_VALUE = 120
const MAX_QUANTITY = 1_000_000
const KEY_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/
const MISSING = Symbol('missing')

type NormalizedValue = OfferTransactionConfigurationValue | typeof MISSING

type ValueValidation =
  | { ok: true; value: NormalizedValue }
  | { ok: false; code: Extract<OfferTransactionConfigurationErrorCode, 'invalid_type' | 'invalid_value'>; message: string }

function recordValue(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function blank(value: unknown): boolean {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0)
}

function textValue(value: unknown, label: string, max: number): ValueValidation {
  if (blank(value)) return { ok: true, value: MISSING }
  if (typeof value !== 'string') {
    return { ok: false, code: 'invalid_type', message: `${label} must be a string.` }
  }
  const normalized = value.trim()
  if (!normalized) return { ok: true, value: MISSING }
  if (normalized.length > max) {
    return { ok: false, code: 'invalid_value', message: `${label} must be at most ${max} characters.` }
  }
  return { ok: true, value: normalized }
}

function numberValue(value: unknown, label: string): ValueValidation {
  if (value == null || value === '') return { ok: true, value: MISSING }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { ok: false, code: 'invalid_type', message: `${label} must be a finite number.` }
  }
  return { ok: true, value }
}

function quantityValue(value: unknown, label: string): ValueValidation {
  const result = numberValue(value, label)
  if (!result.ok || result.value === MISSING) return result
  if (typeof result.value !== 'number') {
    return { ok: false, code: 'invalid_type', message: `${label} must be a finite number.` }
  }
  if (!Number.isInteger(result.value) || result.value < 1 || result.value > MAX_QUANTITY) {
    return {
      ok: false,
      code: 'invalid_value',
      message: `${label} must be a whole number between 1 and ${MAX_QUANTITY}.`,
    }
  }
  return result
}

function booleanValue(value: unknown, label: string): ValueValidation {
  if (value == null || value === '') return { ok: true, value: MISSING }
  if (typeof value !== 'boolean') {
    return { ok: false, code: 'invalid_type', message: `${label} must be true or false.` }
  }
  return { ok: true, value }
}

function optionMap(field: OfferInputField) {
  return new Map((field.options ?? []).map((option, index) => [option.value, index] as const))
}

function singleSelectValue(value: unknown, field: OfferInputField): ValueValidation {
  if (blank(value)) return { ok: true, value: MISSING }
  if (typeof value !== 'string') {
    return { ok: false, code: 'invalid_type', message: `${field.label} must be one declared option value.` }
  }
  const normalized = value.trim()
  if (!normalized || normalized.length > MAX_SELECT_VALUE || !optionMap(field).has(normalized)) {
    return { ok: false, code: 'invalid_value', message: `${field.label} must be one of the merchant's declared options.` }
  }
  return { ok: true, value: normalized }
}

function multiSelectValue(value: unknown, field: OfferInputField): ValueValidation {
  if (blank(value)) return { ok: true, value: MISSING }
  if (!Array.isArray(value)) {
    return { ok: false, code: 'invalid_type', message: `${field.label} must be an array of declared option values.` }
  }
  if (value.length > 25) {
    return { ok: false, code: 'invalid_value', message: `${field.label} can contain at most 25 selections.` }
  }

  const options = optionMap(field)
  const unique = new Set<string>()
  for (const raw of value) {
    if (typeof raw !== 'string') {
      return { ok: false, code: 'invalid_type', message: `${field.label} selections must be strings.` }
    }
    const normalized = raw.trim()
    if (!normalized || normalized.length > MAX_SELECT_VALUE || !options.has(normalized)) {
      return { ok: false, code: 'invalid_value', message: `${field.label} contains an option the merchant did not declare.` }
    }
    unique.add(normalized)
  }

  // Multi-select is set-like commerce input. Canonicalize to the merchant's option
  // order so ["wax", "vacuum"] and ["vacuum", "wax"] bind to the same approval.
  const ordered = [...unique].sort((left, right) => (options.get(left) ?? 0) - (options.get(right) ?? 0))
  return ordered.length ? { ok: true, value: ordered } : { ok: true, value: MISSING }
}

function dateValue(value: unknown, label: string): ValueValidation {
  if (blank(value)) return { ok: true, value: MISSING }
  if (typeof value !== 'string') {
    return { ok: false, code: 'invalid_type', message: `${label} must be a YYYY-MM-DD date.` }
  }
  const normalized = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return { ok: false, code: 'invalid_value', message: `${label} must use YYYY-MM-DD.` }
  }
  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    return { ok: false, code: 'invalid_value', message: `${label} must be a real calendar date.` }
  }
  return { ok: true, value: normalized }
}

function dateTimeValue(value: unknown, label: string): ValueValidation {
  if (blank(value)) return { ok: true, value: MISSING }
  if (typeof value !== 'string') {
    return { ok: false, code: 'invalid_type', message: `${label} must be an ISO date-time string.` }
  }
  const normalized = value.trim()
  if (!normalized || normalized.length > 100) {
    return { ok: false, code: 'invalid_value', message: `${label} must be a valid ISO date-time.` }
  }
  const timestamp = Date.parse(normalized)
  if (!Number.isFinite(timestamp)) {
    return { ok: false, code: 'invalid_value', message: `${label} must be a valid ISO date-time.` }
  }
  return { ok: true, value: new Date(timestamp).toISOString() }
}

function normalizeFieldValue(field: OfferInputField, value: unknown): ValueValidation {
  switch (field.valueType as OfferInputValueType) {
    case 'text':
      return textValue(value, field.label, MAX_TEXT)
    case 'location':
      return textValue(value, field.label, MAX_LOCATION)
    case 'asset':
      // v1 stores an asset reference/URL, never uploaded bytes or arbitrary objects.
      return textValue(value, field.label, MAX_ASSET_REFERENCE)
    case 'number':
      return numberValue(value, field.label)
    case 'quantity':
      return quantityValue(value, field.label)
    case 'boolean':
      return booleanValue(value, field.label)
    case 'single-select':
      return singleSelectValue(value, field)
    case 'multi-select':
      return multiSelectValue(value, field)
    case 'date':
      return dateValue(value, field.label)
    case 'date-time':
      return dateTimeValue(value, field.label)
    default:
      return { ok: false, code: 'invalid_value', message: `${field.label} has an unsupported buyer input type.` }
  }
}

/**
 * Validate buyer transaction data against the merchant-authored configuration
 * schema already attached to the authoritative offer. This function never
 * writes merchant facts and never infers an answer from the schema.
 */
export function validateOfferTransactionConfiguration(
  offer: OfferItem,
  rawConfiguration: unknown,
): OfferTransactionConfigurationValidation {
  const schema = getOfferCustomerInputs(offer)
  const raw = rawConfiguration == null ? {} : recordValue(rawConfiguration)
  if (!raw) {
    return {
      ok: false,
      schema,
      errors: [{ key: null, code: 'configuration_not_object', message: 'offerConfiguration must be an object keyed by merchant input field.' }],
    }
  }

  if (Object.keys(raw).length > MAX_CONFIGURATION_FIELDS) {
    return {
      ok: false,
      schema,
      errors: [{ key: null, code: 'invalid_value', message: `offerConfiguration can contain at most ${MAX_CONFIGURATION_FIELDS} fields.` }],
    }
  }

  const schemaByKey = new Map(schema.map((field) => [field.key, field] as const))
  const errors: OfferTransactionConfigurationError[] = []
  for (const key of Object.keys(raw)) {
    if (!KEY_RE.test(key) || !schemaByKey.has(key)) {
      errors.push({ key, code: 'unknown_field', message: `Unknown offer configuration field ${JSON.stringify(key)}.` })
    }
  }

  const value: OfferTransactionConfiguration = {}
  for (const field of schema) {
    const normalized = normalizeFieldValue(field, raw[field.key])
    if (!normalized.ok) {
      errors.push({ key: field.key, code: normalized.code, message: normalized.message })
      continue
    }
    if (normalized.value === MISSING) {
      if (field.required) {
        errors.push({ key: field.key, code: 'missing_required', message: `${field.label} is required for this offer.` })
      }
      continue
    }
    value[field.key] = normalized.value
  }

  if (errors.length) return { ok: false, schema, errors }
  return { ok: true, schema, value }
}

/**
 * Parse a stored normalized snapshot without consulting a mutable current offer.
 * Settlement must preserve the exact checkout-time contract even if the merchant
 * edits the listing before Stripe completes. Integrity is enforced separately by
 * comparing the trusted fingerprint carried on the Stripe session.
 */
export function parseOfferTransactionConfigurationSnapshot(value: unknown): OfferTransactionConfiguration | null {
  const record = recordValue(value)
  if (!record || Object.keys(record).length > MAX_CONFIGURATION_FIELDS) return null

  const parsed: OfferTransactionConfiguration = {}
  for (const [key, raw] of Object.entries(record)) {
    if (!KEY_RE.test(key)) return null
    if (typeof raw === 'string') {
      if (!raw || raw.length > MAX_TEXT) return null
      parsed[key] = raw
      continue
    }
    if (typeof raw === 'number') {
      if (!Number.isFinite(raw)) return null
      parsed[key] = raw
      continue
    }
    if (typeof raw === 'boolean') {
      parsed[key] = raw
      continue
    }
    if (Array.isArray(raw)) {
      if (raw.length < 1 || raw.length > 25 || raw.some((item) => typeof item !== 'string' || !item || item.length > MAX_SELECT_VALUE)) return null
      parsed[key] = [...raw]
      continue
    }
    return null
  }
  return parsed
}
