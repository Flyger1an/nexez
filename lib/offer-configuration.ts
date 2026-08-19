/**
 * Reusable configuration primitives for service-commerce offers.
 *
 * Ownership boundary:
 * - `OfferInputField` is MERCHANT-authored public schema describing what a
 *   buyer must/may provide before fulfillment (for example vehicle class,
 *   guest count, or an asset upload requirement).
 * - buyer-supplied answers are TRANSACTION data and never belong on OfferItem.
 * - `OfferAttribute` is a public-safe merchant fact/capability. Never put
 *   private negotiation floors, secrets, internal notes, or owner-only rules
 *   in attributes.
 */

export type OfferInputValueType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'single-select'
  | 'multi-select'
  | 'quantity'
  | 'date'
  | 'date-time'
  | 'location'
  | 'asset'

export type OfferInputAffects = 'eligibility' | 'price' | 'duration' | 'availability' | 'scope'

export type OfferInputOption = {
  value: string
  label: string
}

export type OfferInputField = {
  key: string
  label: string
  description?: string
  valueType: OfferInputValueType
  required: boolean
  options?: OfferInputOption[]
  askBuyer: string
  affects?: OfferInputAffects[]
}

export type OfferAttributeValueType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'single-select'
  | 'multi-select'
  | 'duration'
  | 'quantity'

export type OfferAttributeValue = string | number | boolean | string[]

export type OfferAttribute = {
  key: string
  label: string
  valueType: OfferAttributeValueType
  value: OfferAttributeValue
}

export type OfferConfigurationValidation<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

const KEY_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/
const INPUT_VALUE_TYPES = new Set<OfferInputValueType>([
  'text',
  'number',
  'boolean',
  'single-select',
  'multi-select',
  'quantity',
  'date',
  'date-time',
  'location',
  'asset',
])
const ATTRIBUTE_VALUE_TYPES = new Set<OfferAttributeValueType>([
  'text',
  'number',
  'boolean',
  'single-select',
  'multi-select',
  'duration',
  'quantity',
])
const INPUT_AFFECTS = new Set<OfferInputAffects>(['eligibility', 'price', 'duration', 'availability', 'scope'])
const SELECT_INPUT_TYPES = new Set<OfferInputValueType>(['single-select', 'multi-select'])

/**
 * Public configuration must never become an alternate storage surface for
 * credentials, payment data, or private negotiation policy. Exact known keys
 * catch common model/tool mistakes; suffix checks catch provider-prefixed forms
 * such as `stripe_secret_key` without broadly rejecting harmless words.
 */
const SENSITIVE_PUBLIC_KEYS = new Set([
  'api_key',
  'api_token',
  'access_token',
  'refresh_token',
  'password',
  'client_secret',
  'private_key',
  'secret_key',
  'card_number',
  'credit_card_number',
  'cvv',
  'cvc',
  'ssn',
  'social_security_number',
  'bank_account_number',
  'routing_number',
])

/** OfferRules fields that are owner-private and must never be mirrored into a public attribute. */
const PRIVATE_NEGOTIATION_ATTRIBUTE_KEYS = new Set([
  'min_price',
  'max_discount_percent',
  'auto_accept',
  'auto_accept_within_percent',
  'auto_settle_max',
])

function normalizedPolicyKey(key: string): string {
  return key.replace(/-/g, '_')
}

function isSensitivePublicKey(key: string): boolean {
  const normalized = normalizedPolicyKey(key)
  if (SENSITIVE_PUBLIC_KEYS.has(normalized)) return true
  return /(?:^|_)(?:api_token|access_token|refresh_token|client_secret|private_key|secret_key|password)$/.test(normalized)
}

function validateInputKeySafety(key: string): OfferConfigurationValidation<string> {
  if (isSensitivePublicKey(key)) {
    return {
      ok: false,
      error: 'buyer input key requests sensitive credential, payment, or identity data that Nexez must not collect through offer configuration.',
    }
  }
  return { ok: true, value: key }
}

function validateAttributeKeySafety(key: string): OfferConfigurationValidation<string> {
  const normalized = normalizedPolicyKey(key)
  if (isSensitivePublicKey(normalized)) {
    return {
      ok: false,
      error: 'offer attribute key is sensitive and cannot be published as offer configuration.',
    }
  }
  if (PRIVATE_NEGOTIATION_ATTRIBUTE_KEYS.has(normalized)) {
    return {
      ok: false,
      error: 'offer attribute key belongs to owner-private negotiation policy and cannot be published.',
    }
  }
  return { ok: true, value: key }
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function requiredText(value: unknown, field: string, max = 240): OfferConfigurationValidation<string> {
  if (typeof value !== 'string' || !value.trim()) return { ok: false, error: `${field} must be a non-empty string.` }
  const text = value.trim()
  if (text.length > max) return { ok: false, error: `${field} must be at most ${max} characters.` }
  return { ok: true, value: text }
}

function optionalText(value: unknown, field: string, max = 600): OfferConfigurationValidation<string | undefined> {
  if (value == null || value === '') return { ok: true, value: undefined }
  const result = requiredText(value, field, max)
  return result.ok ? { ok: true, value: result.value } : result
}

function validateKey(value: unknown): OfferConfigurationValidation<string> {
  const text = requiredText(value, 'key', 64)
  if (!text.ok) return text
  if (!KEY_RE.test(text.value)) {
    return { ok: false, error: 'key must start with a lowercase letter or digit and contain only lowercase letters, digits, underscores, or hyphens.' }
  }
  return text
}

function validateOptions(value: unknown): OfferConfigurationValidation<OfferInputOption[]> {
  if (!Array.isArray(value) || value.length < 1 || value.length > 25) {
    return { ok: false, error: 'select inputs need between 1 and 25 options.' }
  }

  const options: OfferInputOption[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    const record = objectRecord(raw)
    if (!record) return { ok: false, error: 'each option must be an object with value and label.' }
    const optionValue = requiredText(record.value, 'option.value', 120)
    if (!optionValue.ok) return optionValue
    const optionLabel = requiredText(record.label, 'option.label', 160)
    if (!optionLabel.ok) return optionLabel
    if (seen.has(optionValue.value)) return { ok: false, error: `duplicate option value ${JSON.stringify(optionValue.value)}.` }
    seen.add(optionValue.value)
    options.push({ value: optionValue.value, label: optionLabel.value })
  }
  return { ok: true, value: options }
}

export function validateOfferInputField(value: unknown): OfferConfigurationValidation<OfferInputField> {
  const record = objectRecord(value)
  if (!record) return { ok: false, error: 'offer input must be an object.' }

  const key = validateKey(record.key)
  if (!key.ok) return key
  const safeKey = validateInputKeySafety(key.value)
  if (!safeKey.ok) return safeKey
  const label = requiredText(record.label, 'label', 160)
  if (!label.ok) return label
  const description = optionalText(record.description, 'description')
  if (!description.ok) return description
  const askBuyer = requiredText(record.askBuyer, 'askBuyer', 500)
  if (!askBuyer.ok) return askBuyer
  if (typeof record.valueType !== 'string' || !INPUT_VALUE_TYPES.has(record.valueType as OfferInputValueType)) {
    return { ok: false, error: `unsupported offer input valueType ${JSON.stringify(record.valueType)}.` }
  }
  const valueType = record.valueType as OfferInputValueType
  if (typeof record.required !== 'boolean') return { ok: false, error: 'required must be a boolean.' }

  let options: OfferInputOption[] | undefined
  if (SELECT_INPUT_TYPES.has(valueType)) {
    const validatedOptions = validateOptions(record.options)
    if (!validatedOptions.ok) return validatedOptions
    options = validatedOptions.value
  } else if (record.options != null) {
    return { ok: false, error: `options are only valid for single-select or multi-select inputs.` }
  }

  let affects: OfferInputAffects[] | undefined
  if (record.affects != null) {
    if (!Array.isArray(record.affects)) return { ok: false, error: 'affects must be an array.' }
    const unique: OfferInputAffects[] = []
    for (const raw of record.affects) {
      if (typeof raw !== 'string' || !INPUT_AFFECTS.has(raw as OfferInputAffects)) {
        return { ok: false, error: `unsupported affects value ${JSON.stringify(raw)}.` }
      }
      const effect = raw as OfferInputAffects
      if (!unique.includes(effect)) unique.push(effect)
    }
    affects = unique.length ? unique : undefined
  }

  return {
    ok: true,
    value: {
      key: safeKey.value,
      label: label.value,
      ...(description.value ? { description: description.value } : {}),
      valueType,
      required: record.required,
      ...(options ? { options } : {}),
      askBuyer: askBuyer.value,
      ...(affects ? { affects } : {}),
    },
  }
}

function attributeValueMatches(type: OfferAttributeValueType, value: unknown): value is OfferAttributeValue {
  if (type === 'number' || type === 'quantity') return typeof value === 'number' && Number.isFinite(value)
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'multi-select') return Array.isArray(value) && value.length > 0 && value.length <= 25 && value.every((item) => typeof item === 'string' && item.trim().length > 0)
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeAttributeValue(type: OfferAttributeValueType, value: OfferAttributeValue): OfferAttributeValue {
  if (type === 'multi-select') {
    const unique: string[] = []
    for (const item of value as string[]) {
      const trimmed = item.trim()
      if (!unique.includes(trimmed)) unique.push(trimmed)
    }
    return unique
  }
  if (typeof value === 'string') return value.trim()
  return value
}

export function validateOfferAttribute(value: unknown): OfferConfigurationValidation<OfferAttribute> {
  const record = objectRecord(value)
  if (!record) return { ok: false, error: 'offer attribute must be an object.' }

  const key = validateKey(record.key)
  if (!key.ok) return key
  const safeKey = validateAttributeKeySafety(key.value)
  if (!safeKey.ok) return safeKey
  const label = requiredText(record.label, 'label', 160)
  if (!label.ok) return label
  if (typeof record.valueType !== 'string' || !ATTRIBUTE_VALUE_TYPES.has(record.valueType as OfferAttributeValueType)) {
    return { ok: false, error: `unsupported offer attribute valueType ${JSON.stringify(record.valueType)}.` }
  }
  const valueType = record.valueType as OfferAttributeValueType
  if (!attributeValueMatches(valueType, record.value)) {
    return { ok: false, error: `value does not match attribute valueType ${valueType}.` }
  }

  return {
    ok: true,
    value: {
      key: safeKey.value,
      label: label.value,
      valueType,
      value: normalizeAttributeValue(valueType, record.value),
    },
  }
}

function sanitizeArray<T>(
  value: unknown,
  validate: (entry: unknown) => OfferConfigurationValidation<T & { key: string }>,
): T[] {
  if (!Array.isArray(value)) return []
  const output: T[] = []
  const indexByKey = new Map<string, number>()
  for (const raw of value) {
    const result = validate(raw)
    if (!result.ok) continue
    const key = result.value.key
    const existingIndex = indexByKey.get(key)
    if (existingIndex == null) {
      indexByKey.set(key, output.length)
      output.push(result.value)
    } else {
      output[existingIndex] = result.value
    }
  }
  return output
}

export function sanitizeOfferInputFields(value: unknown): OfferInputField[] {
  return sanitizeArray<OfferInputField>(value, validateOfferInputField)
}

export function sanitizeOfferAttributes(value: unknown): OfferAttribute[] {
  return sanitizeArray<OfferAttribute>(value, validateOfferAttribute)
}

export function upsertOfferInputField(
  existing: OfferInputField[] | null | undefined,
  value: unknown,
): OfferConfigurationValidation<OfferInputField[]> {
  const validated = validateOfferInputField(value)
  if (!validated.ok) return validated
  const current = sanitizeOfferInputFields(existing)
  const index = current.findIndex((entry) => entry.key === validated.value.key)
  if (index === -1) current.push(validated.value)
  else current[index] = validated.value
  return { ok: true, value: current }
}

export function upsertOfferAttribute(
  existing: OfferAttribute[] | null | undefined,
  value: unknown,
): OfferConfigurationValidation<OfferAttribute[]> {
  const validated = validateOfferAttribute(value)
  if (!validated.ok) return validated
  const current = sanitizeOfferAttributes(existing)
  const index = current.findIndex((entry) => entry.key === validated.value.key)
  if (index === -1) current.push(validated.value)
  else current[index] = validated.value
  return { ok: true, value: current }
}
